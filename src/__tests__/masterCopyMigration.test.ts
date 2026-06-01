import { describe, it, expect } from "vitest";
import { addr, safeId, MASTER_COPIES } from "./fixtures/addresses";
import { createIndexer, processOnChain, seedSafe } from "./fixtures/indexer";
import { simulateChangedMasterCopy } from "./fixtures/events";

const CHAIN_ID = 1;

describe("ChangedMasterCopy", () => {
  it("auto-stubs the Safe when ChangedMasterCopy fires before SafeSetup / ProxyCreation", async () => {
    // setup()-time delegate-call setSingleton inside a multiSend bundle would
    // emit ChangedMasterCopy ahead of SafeSetup. Wildcard handler stubs the
    // Safe and resolves the version from the singleton if it's known.
    const indexer = createIndexer();
    const safeAddr = addr("ghost-mc");
    const singleton = MASTER_COPIES.V1_4_1_L2 as `0x${string}`;
    await processOnChain(indexer, CHAIN_ID, [
      simulateChangedMasterCopy({ safeAddress: safeAddr, singleton }),
    ]);
    const stub = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, safeAddr));
    expect(stub.masterCopy).toBe(singleton.toLowerCase());
    expect(stub.version).toBe("V1_4_1");
  });

  it("with an unknown singleton: masterCopy updated lowercase, version unchanged, Version counters untouched", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("mc-unknown");
    const id = seedSafe(indexer, {
      chainId: CHAIN_ID,
      address: safeAddr,
      version: "V1_3_0",
      masterCopy: MASTER_COPIES.V1_3_0_L2,
    });
    // Pre-seed the Version entity to confirm it doesn't move.
    (indexer as any).Version.set({
      id: "V1_3_0",
      numberOfSafes: 5,
      numberOfTransactions: 0,
      numberOfModuleTransactions: 0,
    });

    const unknownSingleton = "0xDEADBEEFcafebabeDEADBEEFcafebabeDEADBEEF";
    await processOnChain(indexer, CHAIN_ID, [
      simulateChangedMasterCopy({
        safeAddress: safeAddr,
        singleton: unknownSingleton as `0x${string}`,
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(id);
    expect(safe.version).toBe("V1_3_0"); // unchanged
    expect(safe.masterCopy).toBe(unknownSingleton.toLowerCase());

    const version = await indexer.Version.getOrThrow("V1_3_0");
    expect(version.numberOfSafes).toBe(5); // unchanged
  });

  it("V1_3_0 → V1_4_1 (both known): version flips, Version counters adjusted", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("mc-13-to-14");
    const id = seedSafe(indexer, {
      chainId: CHAIN_ID,
      address: safeAddr,
      version: "V1_3_0",
      masterCopy: MASTER_COPIES.V1_3_0_L2,
    });
    (indexer as any).Version.set({
      id: "V1_3_0",
      numberOfSafes: 5,
      numberOfTransactions: 0,
      numberOfModuleTransactions: 0,
    });

    await processOnChain(indexer, CHAIN_ID, [
      simulateChangedMasterCopy({
        safeAddress: safeAddr,
        singleton: MASTER_COPIES.V1_4_1_L2 as `0x${string}`,
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(id);
    expect(safe.version).toBe("V1_4_1");
    expect(safe.masterCopy).toBe(MASTER_COPIES.V1_4_1_L2);

    const oldV = await indexer.Version.getOrThrow("V1_3_0");
    expect(oldV.numberOfSafes).toBe(4);
    const newV = await indexer.Version.getOrThrow("V1_4_1");
    expect(newV.numberOfSafes).toBe(1);
  });

  it("V1_3_0 L1 → V1_3_0 L2 (same version, different variant): no Version counter movement", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("mc-l1-to-l2");
    const id = seedSafe(indexer, {
      chainId: CHAIN_ID,
      address: safeAddr,
      version: "V1_3_0",
      masterCopy: MASTER_COPIES.V1_3_0_L1,
    });
    (indexer as any).Version.set({
      id: "V1_3_0",
      numberOfSafes: 3,
      numberOfTransactions: 0,
      numberOfModuleTransactions: 0,
    });

    await processOnChain(indexer, CHAIN_ID, [
      simulateChangedMasterCopy({
        safeAddress: safeAddr,
        singleton: MASTER_COPIES.V1_3_0_L2 as `0x${string}`,
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(id);
    expect(safe.version).toBe("V1_3_0");
    expect(safe.masterCopy).toBe(MASTER_COPIES.V1_3_0_L2);

    const v = await indexer.Version.getOrThrow("V1_3_0");
    expect(v.numberOfSafes).toBe(3); // unchanged
  });

  it("floor at zero: old Version counter doesn't go negative", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("mc-zero-floor");
    const id = seedSafe(indexer, {
      chainId: CHAIN_ID,
      address: safeAddr,
      version: "V1_3_0",
      masterCopy: MASTER_COPIES.V1_3_0_L2,
    });
    // Pre-seed to 0 so the decrement would naively go to -1.
    (indexer as any).Version.set({
      id: "V1_3_0",
      numberOfSafes: 0,
      numberOfTransactions: 0,
      numberOfModuleTransactions: 0,
    });

    await processOnChain(indexer, CHAIN_ID, [
      simulateChangedMasterCopy({
        safeAddress: safeAddr,
        singleton: MASTER_COPIES.V1_4_1_L2 as `0x${string}`,
      }),
    ]);

    const oldV = await indexer.Version.getOrThrow("V1_3_0");
    expect(oldV.numberOfSafes).toBe(0); // Math.max floor
    void id;
  });
});
