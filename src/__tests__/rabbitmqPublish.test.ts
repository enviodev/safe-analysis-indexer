import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { EvmOnEventContext } from "envio";
import { getAddress } from "viem";
import { addr } from "./fixtures/addresses";
import { publishIfRealtime, publishSafeEventEffect } from "../rabbitmqEffect";
import {
  buildExecutedMultisigTransaction,
  buildIncomingEther,
  buildErc20Token,
  buildErc721Token,
  type SafeEventPayload,
} from "../safeEvents";

// The handler-call sites are thin glue: builder + publishIfRealtime. The
// builders are exhaustively unit-tested in safeEvents.test.ts; here we test
// the gating logic of publishIfRealtime and verify it forwards payloads to
// the effect correctly.
//
// We don't run through the TestIndexer because publishes happen inside the
// effect worker process (separate from the main test thread), so the
// in-memory testBuffer in rabbitmq.ts is process-isolated and unreadable
// from the test side. Instead we fake the context's `effect` method to
// capture invocations directly.

type CapturedInvocation = { effect: unknown; input: unknown };

function makeContext(opts: { isPreload: boolean; isRealtime: boolean }) {
  const calls: CapturedInvocation[] = [];
  return {
    calls,
    // Only the surface publishIfRealtime touches (isPreload / chain / effect);
    // cast to the full handler context type at the boundary.
    context: {
      isPreload: opts.isPreload,
      chain: { id: 1, isRealtime: opts.isRealtime },
      effect: async (effect: unknown, input: unknown): Promise<unknown> => {
        calls.push({ effect, input });
        return null;
      },
    } as unknown as EvmOnEventContext,
  };
}

beforeEach(() => {
  delete process.env.ENVIO_TEST_FORCE_REALTIME;
});
afterEach(() => {
  delete process.env.ENVIO_TEST_FORCE_REALTIME;
});

// --- Gating ----------------------------------------------------------------

describe("publishIfRealtime: gating", () => {
  const payload: SafeEventPayload = buildIncomingEther({
    chainId: 1,
    safeAddress: addr("safe"),
    txHash: "0x" + "ab".repeat(32),
    value: 100n,
  });

  it("does NOT invoke the effect during preload", async () => {
    const { context, calls } = makeContext({ isPreload: true, isRealtime: true });
    await publishIfRealtime(context, payload);
    expect(calls).toEqual([]);
  });

  it("does NOT invoke the effect when chain.isRealtime is false", async () => {
    const { context, calls } = makeContext({ isPreload: false, isRealtime: false });
    await publishIfRealtime(context, payload);
    expect(calls).toEqual([]);
  });

  it("invokes the effect when not preload and realtime is true", async () => {
    const { context, calls } = makeContext({ isPreload: false, isRealtime: true });
    await publishIfRealtime(context, payload);
    expect(calls.length).toBe(1);
    expect(calls[0]!.effect).toBe(publishSafeEventEffect);
  });

  it("ENVIO_TEST_FORCE_REALTIME=true overrides a falsy context.chain.isRealtime", async () => {
    process.env.ENVIO_TEST_FORCE_REALTIME = "true";
    const { context, calls } = makeContext({ isPreload: false, isRealtime: false });
    await publishIfRealtime(context, payload);
    expect(calls.length).toBe(1);
  });

  it("ENVIO_TEST_FORCE_REALTIME=false suppresses publishing even when context says realtime", async () => {
    process.env.ENVIO_TEST_FORCE_REALTIME = "false";
    const { context, calls } = makeContext({ isPreload: false, isRealtime: true });
    await publishIfRealtime(context, payload);
    expect(calls).toEqual([]);
  });
});

// --- Payload round-trip ----------------------------------------------------

describe("publishIfRealtime: payload round-trip", () => {
  it("serialises the payload to JSON in the effect input and deserialises losslessly", async () => {
    const { context, calls } = makeContext({ isPreload: false, isRealtime: true });
    const payload = buildExecutedMultisigTransaction({
      chainId: 100,
      safeAddress: addr("round-trip-safe"),
      safeTxHash: "0x" + "cd".repeat(32),
      to: addr("recipient"),
      data: "0xdeadbeef",
      success: true,
      txHash: "0x" + "ef".repeat(32),
    });
    await publishIfRealtime(context, payload);
    const input = calls[0]!.input as { payloadJson: string };
    expect(typeof input.payloadJson).toBe("string");
    expect(JSON.parse(input.payloadJson)).toEqual(payload);
  });
});

// --- One end-to-end check per builder shape --------------------------------
// Each handler call site shapes a payload then calls publishIfRealtime.
// Verifying the JSON parsed back from `input.payloadJson` matches what the
// builder produced gives us the wiring-equivalent coverage we'd otherwise
// get from a full TestIndexer integration test.

describe("publishIfRealtime: per-event-type shape via the effect input", () => {
  it("EXECUTED_MULTISIG_TRANSACTION shape (success → failed:\"false\")", async () => {
    const { context, calls } = makeContext({ isPreload: false, isRealtime: true });
    await publishIfRealtime(
      context,
      buildExecutedMultisigTransaction({
        chainId: 1,
        safeAddress: addr("exec-safe"),
        safeTxHash: "0x" + "aa".repeat(32),
        to: addr("recip"),
        data: "0xfeed",
        success: true,
        txHash: "0x" + "bb".repeat(32),
      }),
    );
    const decoded = JSON.parse((calls[0]!.input as any).payloadJson);
    expect(decoded.type).toBe("EXECUTED_MULTISIG_TRANSACTION");
    expect(decoded.failed).toBe("false");
    expect(decoded.address).toBe(getAddress(addr("exec-safe")));
  });

  it("INCOMING_ETHER shape", async () => {
    const { context, calls } = makeContext({ isPreload: false, isRealtime: true });
    await publishIfRealtime(
      context,
      buildIncomingEther({
        chainId: 1,
        safeAddress: addr("ether-safe"),
        txHash: "0x" + "cc".repeat(32),
        value: 1234567890n,
      }),
    );
    const decoded = JSON.parse((calls[0]!.input as any).payloadJson);
    expect(decoded.type).toBe("INCOMING_ETHER");
    expect(decoded.value).toBe("1234567890");
  });

  it("ERC20 OUTGOING_TOKEN shape", async () => {
    const { context, calls } = makeContext({ isPreload: false, isRealtime: true });
    await publishIfRealtime(
      context,
      buildErc20Token({
        chainId: 1,
        safeAddress: addr("erc20-safe"),
        tokenAddress: addr("token"),
        txHash: "0x" + "dd".repeat(32),
        value: 99n,
        direction: "OUTGOING_TOKEN",
      }),
    );
    const decoded = JSON.parse((calls[0]!.input as any).payloadJson);
    expect(decoded.type).toBe("OUTGOING_TOKEN");
    expect(decoded.value).toBe("99");
    expect(decoded.tokenAddress).toBe(getAddress(addr("token")));
  });

  it("ERC721 INCOMING_TOKEN shape (tokenId, no value)", async () => {
    const { context, calls } = makeContext({ isPreload: false, isRealtime: true });
    await publishIfRealtime(
      context,
      buildErc721Token({
        chainId: 1,
        safeAddress: addr("erc721-safe"),
        tokenAddress: addr("nft"),
        txHash: "0x" + "ee".repeat(32),
        tokenId: 7n,
        direction: "INCOMING_TOKEN",
      }),
    );
    const decoded = JSON.parse((calls[0]!.input as any).payloadJson);
    expect(decoded.type).toBe("INCOMING_TOKEN");
    expect(decoded.tokenId).toBe("7");
    expect("value" in decoded).toBe(false);
  });
});
