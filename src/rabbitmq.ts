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

// True only when the operator has explicitly opted in. Anything other than
// "true" / "1" / "yes" (case-insensitive) is treated as off — including the
// default unset case.
function parseBool(v: string | undefined): boolean {
    if (!v) return false;
    const lower = v.trim().toLowerCase();
    return lower === "true" || lower === "1" || lower === "yes";
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

async function connect(): Promise<void> {
    if (state.kind === "ready" || state.kind === "connecting") return;
    if (state.kind === "disabled") return;
    state = { kind: "connecting" };

    const url = process.env[ENV_AMQP_URL]!;
    const exchange = process.env[ENV_AMQP_EXCHANGE]!;

    try {
        const conn = await amqplib.connect(url);
        const channel = await conn.createChannel();
        await channel.assertExchange(exchange, "fanout", { durable: true });

        conn.on("error", (err: Error) => {
            console.warn(`[rabbitmq] connection error: ${err.message}`);
        });
        conn.on("close", () => {
            console.warn("[rabbitmq] connection closed; scheduling reconnect");
            state = { kind: "reconnecting", attempt: 0 };
            scheduleReconnect();
        });

        state = { kind: "ready", channel, conn } as State;
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[rabbitmq] initial connect failed: ${msg}; scheduling reconnect`);
        state = { kind: "reconnecting", attempt: 0 };
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
        state = { kind: "reconnecting", attempt: attempt + 1 };
        void connect().then(() => {
            if (state.kind === "reconnecting") scheduleReconnect();
        });
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
