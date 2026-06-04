// Fire-and-forget RabbitMQ publisher for Safe Transaction Service-compatible
// events.
//
// All env vars share the `ENVIO_` prefix so they're picked up by the
// envio-cloud hosted indexer service (which strips out anything that
// doesn't carry the prefix at deploy time).
//
// Three orthogonal gates decide whether a publish actually leaves the process:
//
//   1. `ENVIO_AMQP_PUBLISH_ENABLED` env var (default false) — hard toggle,
//      lets production run two indexer instances side-by-side with only one
//      of them holding the publisher socket. If unset / false, the publisher
//      is a permanent no-op regardless of any other config.
//   2. `ENVIO_TEST_MODE === "1"` — unit-test mode. Payloads are buffered in
//      memory (see `getPublishStats`) but no network IO occurs. Set by
//      `src/__tests__/setup.ts` for the unit suite.
//   3. `ENVIO_AMQP_URL` + `ENVIO_AMQP_EXCHANGE` env vars — when enabled,
//      both are required. Missing either drops the publisher into a no-op
//      fail-open mode that logs the misconfiguration once.
//
// Fire-and-forget semantics per the Safe events spec: consumers are
// expected to come back to the canonical REST API for source-of-truth, so
// dropped messages are a recoverable signal rather than a data-loss event.
// On any error (connection down, channel closed, oversize payload) we log
// once at warn level and drop the message; we never throw.
//
// Reconnect loop with exponential backoff (500ms → 30s cap) recovers
// automatically when the broker comes back; messages published during the
// outage are lost.

import * as amqplib from "amqplib";
import type { SafeEventPayload } from "./safeEvents";

const ENV_PUBLISH_ENABLED = "ENVIO_AMQP_PUBLISH_ENABLED";
const ENV_AMQP_URL = "ENVIO_AMQP_URL";
const ENV_AMQP_EXCHANGE = "ENVIO_AMQP_EXCHANGE";
// Optional override for the broker port. If unset, amqplib uses the URL's
// own port; if the URL has none, amqplib defaults to 5672 for `amqp://`
// and 5671 for `amqps://` (per the AMQP URI spec). Only set this when
// your broker listens on a non-standard port.
const ENV_AMQP_PORT = "ENVIO_AMQP_PORT";

// True only when the operator has explicitly opted in. Anything other than
// "true" / "1" / "yes" (case-insensitive) is treated as off — including the
// default unset case.
function parseBool(v: string | undefined): boolean {
    if (!v) return false;
    const lower = v.trim().toLowerCase();
    return lower === "true" || lower === "1" || lower === "yes";
}

// Inject an explicit port into an AMQP URL when `ENVIO_AMQP_PORT` is set.
// No-op when the env var is unset or empty — amqplib's URL parser then
// uses whatever port is in the URL itself, or falls back to the scheme
// default (5672 for amqp://, 5671 for amqps://). The override is applied
// even if the URL already has a port; env var wins.
export function applyPortOverride(rawUrl: string, portEnv: string | undefined): string {
    if (!portEnv || !portEnv.trim()) return rawUrl;
    const port = Number.parseInt(portEnv.trim(), 10);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        throw new Error(
            `${ENV_AMQP_PORT} must be a positive integer (1-65535); got "${portEnv}"`,
        );
    }
    try {
        const u = new URL(rawUrl);
        u.port = String(port);
        return u.toString();
    } catch {
        // URL parse failed — bail to the original string and let amqplib
        // surface a cleaner error.
        return rawUrl;
    }
}

// Resolved at module load so test/dev startup costs don't recur per publish.
// Production processes have stable env vars; if you need to flip the toggle
// you restart the indexer (which is also when you re-deploy anyway).
const PUBLISH_ENABLED = parseBool(process.env[ENV_PUBLISH_ENABLED]);
const TEST_MODE = process.env.ENVIO_TEST_MODE === "1";

// In test mode we buffer payloads so tests can assert on what would have
// been published without touching a real broker. Cleared per-test via
// clearPublishStats().
const testBuffer: SafeEventPayload[] = [];

export function getPublishStats(): { count: number; payloads: SafeEventPayload[] } {
    return { count: testBuffer.length, payloads: [...testBuffer] };
}

export function clearPublishStats(): void {
    testBuffer.length = 0;
}

// --- Connection state ---------------------------------------------------

type State =
    | { kind: "disabled"; reason: string }
    | { kind: "idle" }
    | { kind: "connecting" }
    | { kind: "ready"; channel: amqplib.ChannelModel["createChannel"] extends () => Promise<infer C> ? C : never; conn: amqplib.ChannelModel }
    | { kind: "reconnecting"; attempt: number };

let state: State = resolveInitialState();
let warnedMisconfigured = false;

function resolveInitialState(): State {
    if (!PUBLISH_ENABLED) {
        return { kind: "disabled", reason: `${ENV_PUBLISH_ENABLED} not enabled` };
    }
    if (TEST_MODE) {
        // Test mode is enabled-but-buffered. State stays "idle" so publish()
        // takes the test-mode branch before touching the network.
        return { kind: "idle" };
    }
    const url = process.env[ENV_AMQP_URL];
    const exchange = process.env[ENV_AMQP_EXCHANGE];
    if (!url || !exchange) {
        return {
            kind: "disabled",
            reason: `${ENV_PUBLISH_ENABLED}=true but ${ENV_AMQP_URL}/${ENV_AMQP_EXCHANGE} missing`,
        };
    }
    return { kind: "idle" };
}

// --- Connect / reconnect ------------------------------------------------

// `attempt` threads through so each successive failed connect grows the
// backoff (the catch preserves it; scheduleReconnect increments it on each
// fire). External callers (publishSafeEvent lazy-connect, ensureConnected)
// pass nothing and start at 0 — only scheduleReconnect's setTimeout passes
// the incremented attempt.
async function connect(attempt = 0): Promise<void> {
    if (state.kind === "ready" || state.kind === "connecting") return;
    if (state.kind === "disabled") return;
    state = { kind: "connecting" };

    const url = applyPortOverride(
        process.env[ENV_AMQP_URL]!,
        process.env[ENV_AMQP_PORT],
    );
    const exchange = process.env[ENV_AMQP_EXCHANGE]!;

    try {
        const conn = await amqplib.connect(url);
        // Register the error listener BEFORE any further awaits so a
        // server-side rejection (e.g. PRECONDITION_FAILED on assertExchange
        // when the exchange exists with different args) doesn't crash the
        // process via an unhandled 'error' event on the ChannelModel.
        conn.on("error", (err: Error) => {
            console.warn(`[rabbitmq] connection error: ${err.message}`);
        });
        conn.on("close", () => {
            console.warn("[rabbitmq] connection closed; scheduling reconnect");
            // A successful connection that dropped resets the backoff —
            // the broker was clearly reachable; treat the next reconnect
            // attempt as the first one for this outage.
            state = { kind: "reconnecting", attempt: 0 };
            scheduleReconnect();
        });

        const channel = await conn.createChannel();
        channel.on("error", (err: Error) => {
            console.warn(`[rabbitmq] channel error: ${err.message}`);
        });
        await channel.assertExchange(exchange, "fanout", { durable: true });

        state = { kind: "ready", channel, conn } as State;
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[rabbitmq] initial connect failed: ${msg}; scheduling reconnect`);
        // Preserve the attempt so backoff grows on successive failures.
        state = { kind: "reconnecting", attempt };
        scheduleReconnect();
    }
}

function backoffMs(attempt: number): number {
    // 500ms → 1s → 2s → 4s → 8s → 16s → 30s cap.
    return Math.min(30_000, 500 * 2 ** attempt);
}

function scheduleReconnect(): void {
    if (state.kind !== "reconnecting") return;
    const attempt = state.attempt;
    setTimeout(() => {
        // Re-check state at fire time — a successful manual reconnect or a
        // shutdown could have moved us.
        if (state.kind !== "reconnecting") return;
        const nextAttempt = attempt + 1;
        state = { kind: "reconnecting", attempt: nextAttempt };
        // connect()'s catch handles scheduling the *next* reconnect on
        // failure — no follow-up .then() needed here. Removing it
        // eliminates the duplicate-timer hazard CodeRabbit flagged.
        void connect(nextAttempt);
    }, backoffMs(attempt));
}

// --- Publish ------------------------------------------------------------

export function publishSafeEvent(payload: SafeEventPayload): void {
    // Test-mode: buffer and bail. The hard `PUBLISH_ENABLED` toggle is
    // bypassed here on purpose — handler-integration tests should still be
    // able to assert "would have published X" regardless of env config.
    if (TEST_MODE) {
        testBuffer.push(payload);
        return;
    }

    if (state.kind === "disabled") {
        if (!warnedMisconfigured) {
            warnedMisconfigured = true;
            console.warn(`[rabbitmq] publisher disabled: ${state.reason}`);
        }
        return;
    }

    if (state.kind !== "ready") {
        // Lazy-connect on first publish, then drop this message. Subsequent
        // publishes will land once the connection is ready. Acceptable per
        // the fire-and-forget semantics.
        if (state.kind === "idle") void connect();
        return;
    }

    try {
        const exchange = process.env[ENV_AMQP_EXCHANGE]!;
        const body = Buffer.from(JSON.stringify(payload));
        // Fanout exchange ignores the routing key; pass empty string per
        // amqplib convention.
        // `publish` is synchronous and returns false when the channel's
        // outbound buffer is full — we still log and continue.
        const ok = state.channel.publish(exchange, "", body, { persistent: true });
        if (!ok) {
            console.warn("[rabbitmq] channel write buffer full; message dropped");
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[rabbitmq] publish failed: ${msg}`);
    }
}

// Exposed for tests / health checks. Lets callers inspect the publisher's
// current configuration without forcing them to re-read env vars.
export function publisherStatus(): { enabled: boolean; testMode: boolean; reason?: string } {
    return {
        enabled: state.kind !== "disabled",
        testMode: TEST_MODE,
        reason: state.kind === "disabled" ? state.reason : undefined,
    };
}

// Force the publisher to (re)connect eagerly and resolve once the channel
// is ready to accept publishes. Used by smoke-test scripts that need to
// publish exactly N messages and know they all landed; the production
// indexer path stays lazy-connected via the first publish() call.
export async function ensureConnected(): Promise<void> {
    if (state.kind === "disabled") {
        throw new Error(`publisher disabled: ${state.reason}`);
    }
    if (state.kind === "ready") return;
    await connect();
    // TS doesn't track that `connect()` reassigns the module-level `state`.
    if ((state as State).kind !== "ready") {
        throw new Error("publisher failed to reach ready state");
    }
}

// Cleanly close the connection. For long-lived processes the publisher
// stays open; smoke-test scripts call this before exit so the message
// flush completes and the process exits without hanging on an open socket.
export async function closePublisher(): Promise<void> {
    if (state.kind === "ready") {
        const conn = state.conn;
        // Move state out of "ready" first so the "close" event handler
        // doesn't try to reconnect.
        state = { kind: "disabled", reason: "closed by closePublisher()" };
        try {
            await conn.close();
        } catch {
            // ignore — connection might already be torn down
        }
    }
}
