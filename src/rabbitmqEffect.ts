// Envio Effect wrapper around the singleton RabbitMQ publisher.
//
// Why an Effect rather than a direct call: the Effects API gives us a
// single named hookpoint that's visible to Envio's batching, retry, and
// observability layers. Disabling publishing in a hot path becomes
// flipping `AMQP_PUBLISH_ENABLED` rather than touching handler code.
//
// The effect is `cache: false` because each publish is a unique
// side-effect — two ExecutionSuccess events with identical payloads should
// each fire a message, not return a cached "we already published this".
//
// Payload travels through the effect as a JSON-serialised string (envio's
// S.schema doesn't model discriminated unions directly). The publisher
// receives the structured object on the other side.

import { createEffect, S, type EvmOnEventContext } from "envio";
import type { SafeEventPayload } from "./safeEvents";
import { publishSafeEvent } from "./rabbitmq";

export const publishSafeEventEffect = createEffect(
    {
        name: "publishSafeEvent",
        input: S.schema({ payloadJson: S.string }),
        output: S.nullable(S.string),
        rateLimit: false,
        cache: false,
    },
    async ({ input }) => {
        try {
            const payload = JSON.parse(input.payloadJson) as SafeEventPayload;
            publishSafeEvent(payload);
            return null;
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[publishSafeEventEffect] drop: ${msg}`);
            return msg;
        }
    },
);

// Shared realtime/preload gate for all handler call-sites. The publisher
// only fires once Envio's global isRealtime flag is true (all chains caught
// up to head, see Envio 3.1.0-rc.2 types) AND we're outside the preload
// pass. This is the single place that knowledge lives — handlers just call
// publishIfRealtime(context, buildXxx(...)).
export async function publishIfRealtime(
    context: EvmOnEventContext,
    payload: SafeEventPayload,
): Promise<void> {
    if (context.isPreload) return;
    if (!isInRealtime(context)) return;
    await context.effect(publishSafeEventEffect, { payloadJson: JSON.stringify(payload) });
}

// Test escape hatch: envio's TestIndexer always reports
// `context.chain.isRealtime === true` for finite-range simulate runs (the
// indexer "reaches endBlock" so by definition it's caught up). To exercise
// the historical-sync code path in unit tests, set the env var
// `ENVIO_TEST_FORCE_REALTIME=false` before invoking the handler. The check
// is single-env-var-read overhead; production never sets it.
function isInRealtime(context: EvmOnEventContext): boolean {
    const forced = process.env.ENVIO_TEST_FORCE_REALTIME;
    if (forced === "true") return true;
    if (forced === "false") return false;
    return Boolean(context.chain?.isRealtime);
}
