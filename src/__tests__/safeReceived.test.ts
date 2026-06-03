import { describe, it, expect } from "vitest";
import { addr } from "./fixtures/addresses";
import { createIndexer, processOnChain, seedSafe } from "./fixtures/indexer";
import { simulateSafeReceived } from "./fixtures/events";

const CHAIN_ID = 1;

describe("GnosisSafeL2.SafeReceived (native ETH inbound, v1.3.0+)", () => {
  it("writes a NativeTransfer row when the recipient is a known Safe", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("native-recv-safe");
    seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr });

    const sender = addr("native-recv-sender");
    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeReceived({ safeAddress: safeAddr, sender, value: 1_000_000_000_000_000_000n }),
    ]);

    const rows = await indexer.NativeTransfer.getAll();
    expect(rows.length).toBe(1);
    const row = rows[0]!;
    expect(row.safeAddress).toBe(safeAddr.toLowerCase());
    expect(row.sender).toBe(sender.toLowerCase());
    expect(row.value).toBe(1_000_000_000_000_000_000n);
  });

  it("skips when the emitter is not a known Safe (topic0 collision guard)", async () => {
    const indexer = createIndexer();
    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeReceived({
        safeAddress: addr("phantom-emitter"),
        sender: addr("some-sender"),
        value: 1n,
      }),
    ]);
    expect(await indexer.NativeTransfer.getAll()).toEqual([]);
  });

  it("records every receive — no dedup, multiple transfers same Safe accumulate as rows", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("native-recv-multi");
    seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr });

    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeReceived({ safeAddress: safeAddr, sender: addr("s1"), value: 1n }),
      simulateSafeReceived({ safeAddress: safeAddr, sender: addr("s2"), value: 2n }),
      simulateSafeReceived({ safeAddress: safeAddr, sender: addr("s1"), value: 3n }),
    ]);

    const rows = await indexer.NativeTransfer.getAll();
    expect(rows.length).toBe(3);
    expect(rows.map((r) => r.value).sort()).toEqual([1n, 2n, 3n]);
  });
});
