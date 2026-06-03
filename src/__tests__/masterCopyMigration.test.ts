import { describe, it, expect } from "vitest";
import { addr, safeId, MASTER_COPIES } from "./fixtures/addresses";
import {
  createIndexer,
  processOnChain,
  seedSafe,
  setEffectFixtures,
  clearEffectFixtures,
} from "./fixtures/indexer";
import {
  simulateChangedMasterCopy,
  simulateSafeSetup,
  simulateProxyCreationModern,
} from "./fixtures/events";

const CHAIN_ID = 1;

describe("ChangedMasterCopy", () => {
  it("auto-stubs the Safe when ChangedMasterCopy fires before SafeSetup / ProxyCreation", async () => {
    // setup()-time delegate-call setSingleton inside a multiSend bundle would
    // emit ChangedMasterCopy ahead of SafeSetup. Wildcard handler stubs the
    // Safe with version=UNKNOWN, then resolves the version from the singleton.
    //
    // Critically, the Version-stats reconciliation must be SKIPPED on this
    // path: the stub was never counted in numberOfSafes (incrementSafeCount
    // fires from ProxyCreation), so decrementing the old version or
    // incrementing the new would phantom-count a Safe that ProxyCreation
    // hasn't yet blessed. ProxyCreation will increment the resolved version
    // exactly once when it arrives.
    const indexer = createIndexer();
    const safeAddr = addr("ghost-mc");
    const singleton = MASTER_COPIES.V1_4_1_L2 as `0x${string}`;
    await processOnChain(indexer, CHAIN_ID, [
      simulateChangedMasterCopy({ safeAddress: safeAddr, singleton }),
    ]);
    const stub = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, safeAddr));
    expect(stub.masterCopy).toBe(singleton.toLowerCase());
    expect(stub.version).toBe("V1_4_1_L2");

    // No Version entity should have been touched: not the resolved 1.4.1+L2
    // (the stub is uncounted) and not the stub's prior UNKNOWN version.
    expect((await indexer.Version.get("V1_4_1_L2"))?.numberOfSafes ?? 0).toBe(0);
    expect((await indexer.Version.get("UNKNOWN"))?.numberOfSafes ?? 0).toBe(0);
    expect((await indexer.Version.get("V1_3_0_L2"))?.numberOfSafes ?? 0).toBe(0);
  });

  it("RPC-backfilled orphan + later ChangedMasterCopy does NOT corrupt Version counters", async () => {
    // Regression for the CodeRabbit-flagged scenario: an RPC-backfilled
    // orphan has a real `version` (e.g. V1_3_0) but was NEVER counted by
    // `incrementSafeCount` (only `ProxyCreation` counts, and the whole point
    // of an orphan is that ProxyCreation never arrives). When a later
    // `ChangedMasterCopy` fires for this Safe, the handler must NOT
    // decrement the old version (the Safe never contributed to it) and must
    // NOT increment the new version (the Safe still hasn't been blessed by
    // ProxyCreation). The `safe.counted` flag is the load-bearing guard.
    clearEffectFixtures();
    const safeAddr = addr("orphan-then-mc");
    setEffectFixtures({
      getSafeMasterCopyViaRpc: {
        [JSON.stringify({ chainId: CHAIN_ID, safeAddress: safeAddr })]:
          MASTER_COPIES.V1_3_0_L2,
      },
    });

    // Seed a different version's counter so we'd notice if it moved.
    // Use the STS L2 keys since the safe under test resolves to L2 versions
    // via RPC backfill and ChangedMasterCopy — the test asserts these
    // pre-seeded counters DON'T move.
    const indexer = createIndexer();
    (indexer as any).Version.set({
      id: "V1_3_0_L2",
      numberOfSafes: 7,
      numberOfTransactions: 0,
      numberOfModuleTransactions: 0,
    });
    (indexer as any).Version.set({
      id: "V1_4_1_L2",
      numberOfSafes: 3,
      numberOfTransactions: 0,
      numberOfModuleTransactions: 0,
    });

    await processOnChain(indexer, CHAIN_ID, [
      // SafeSetup with no preceding/following ProxyCreation → orphan path,
      // RPC backfill resolves singleton → version becomes V1_3_0, but
      // counted stays false.
      simulateSafeSetup({
        safeAddress: safeAddr,
        owners: [addr("orphan-then-mc-owner")],
        threshold: 1n,
      }),
      // Now an explicit master-copy migration to V1_4_1. Without the
      // `counted` guard, this would do -1 to V1_3_0 and +1 to V1_4_1 —
      // both wrong, since the Safe was never in those counts to begin with.
      simulateChangedMasterCopy({
        safeAddress: safeAddr,
        singleton: MASTER_COPIES.V1_4_1_L2 as `0x${string}`,
      }),
    ]);

    // Safe entity ends up with the post-migration shape:
    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, safeAddr));
    expect(safe.version).toBe("V1_4_1_L2");
    expect(safe.masterCopy).toBe(MASTER_COPIES.V1_4_1_L2);
    expect(safe.counted).toBe(false);

    // Counters MUST be unchanged from their pre-seeded values — the
    // RPC-backfilled orphan never touched them on the SafeSetup path, and
    // ChangedMasterCopy must short-circuit because counted=false.
    expect((await indexer.Version.get("V1_3_0_L2"))?.numberOfSafes).toBe(7);
    expect((await indexer.Version.get("V1_4_1_L2"))?.numberOfSafes).toBe(3);

    clearEffectFixtures();
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

  it("1.3.0+L2 → 1.4.1+L2: version flips, Version counters adjusted", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("mc-13-to-14");
    const id = seedSafe(indexer, {
      chainId: CHAIN_ID,
      address: safeAddr,
      version: "V1_3_0_L2",
      masterCopy: MASTER_COPIES.V1_3_0_L2,
    });
    (indexer as any).Version.set({
      id: "V1_3_0_L2",
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
    expect(safe.version).toBe("V1_4_1_L2");
    expect(safe.masterCopy).toBe(MASTER_COPIES.V1_4_1_L2);

    const oldV = await indexer.Version.getOrThrow("V1_3_0_L2");
    expect(oldV.numberOfSafes).toBe(4);
    const newV = await indexer.Version.getOrThrow("V1_4_1_L2");
    expect(newV.numberOfSafes).toBe(1);
  });

  it("1.3.0 L1 → 1.3.0+L2 (same numeric version, different variant): counters DO move (L1 / L2 are separate STS buckets)", async () => {
    // Semantic change vs the pre-STS-format scheme: previously L1 and L2 of
    // the same numeric version shared one Version stat ("V1_3_0"); now they
    // are distinct stats keyed by the STS strings "V1_3_0" and "V1_3_0_L2"
    // (matching Safe Transaction Service's own split).
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
    expect(safe.version).toBe("V1_3_0_L2");
    expect(safe.masterCopy).toBe(MASTER_COPIES.V1_3_0_L2);

    const l1 = await indexer.Version.getOrThrow("V1_3_0");
    expect(l1.numberOfSafes).toBe(2); // -1: L1 bucket loses one
    const l2 = await indexer.Version.getOrThrow("V1_3_0_L2");
    expect(l2.numberOfSafes).toBe(1); // +1: L2 bucket gains one
  });

  it("floor at zero: old Version counter doesn't go negative", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("mc-zero-floor");
    const id = seedSafe(indexer, {
      chainId: CHAIN_ID,
      address: safeAddr,
      version: "V1_3_0_L2",
      masterCopy: MASTER_COPIES.V1_3_0_L2,
    });
    // Pre-seed to 0 so the decrement would naively go to -1.
    (indexer as any).Version.set({
      id: "V1_3_0_L2",
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

    const oldV = await indexer.Version.getOrThrow("V1_3_0_L2");
    expect(oldV.numberOfSafes).toBe(0); // Math.max floor
    void id;
  });
});

describe("ProxyCreation does not clobber a pre-arrived ChangedMasterCopy (L1→L2 migration during setup)", () => {
  it("ChangedMasterCopy(L2) before ProxyCreation(L1): final masterCopy = L2 (the post-delegate-call state)", async () => {
    // Repro for the production bug surfaced on Gnosis Safes
    // 0x2e94924a…8496a5e3 and 0xf55a8b…227b50f9. Real on-chain log order:
    //   [0] ChangedMasterCopy(L2 singleton)  ← from setup()-time delegate-call
    //                                           (multiSend calling
    //                                           changeMasterCopy via
    //                                           the SafeMigration pattern)
    //   [1] SafeSetup
    //   [2] ProxyCreation(proxy, singleton=L1)  ← FACTORY emits with the
    //                                             INITIAL singleton it
    //                                             deployed against — NOT
    //                                             the post-delegate-call
    //                                             state.
    //
    // Pre-fix `handleModernProxyCreation` unconditionally overwrote
    // masterCopy with ProxyCreation's `singleton` arg (L1), clobbering the
    // ChangedMasterCopy-set L2. Fix: preserve any already-set masterCopy
    // on the existing-safe branch (same defensive pattern as
    // fallbackHandler in #45).
    const indexer = createIndexer();
    const proxy = addr("mc-l1-to-l2");

    await processOnChain(indexer, CHAIN_ID, [
      simulateChangedMasterCopy({
        safeAddress: proxy,
        singleton: MASTER_COPIES.V1_4_1_L2 as `0x${string}`,
      }),
      simulateSafeSetup({
        safeAddress: proxy,
        owners: [addr("mc-migration-owner")],
        threshold: 1n,
      }),
      simulateProxyCreationModern({
        contract: "GnosisSafeProxy1_4_1",
        proxy,
        singleton: MASTER_COPIES.V1_4_1_L1 as `0x${string}`,
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    expect(safe.masterCopy).toBe(MASTER_COPIES.V1_4_1_L2);
    // ChangedMasterCopy(L2) set version="V1_4_1_L2", ProxyCreation(L1) would
    // overwrite to "V1_4_1" without the preserve. The preserve keeps the
    // post-delegate-call L2 state.
    expect(safe.version).toBe("V1_4_1_L2");
    // ProxyCreation still wins for `factoryAddress` (its canonical field).
    expect(safe.factoryAddress).toBeDefined();
    expect(safe.counted).toBe(true);
  });

  it("ProxyCreation alone (no prior ChangedMasterCopy): masterCopy = ProxyCreation's singleton", async () => {
    // Counter-test: the preserve logic must not break the normal path.
    // If no prior event set masterCopy, ProxyCreation's `singleton` arg is
    // still the source of truth.
    const indexer = createIndexer();
    const proxy = addr("mc-no-prior");

    await processOnChain(indexer, CHAIN_ID, [
      simulateProxyCreationModern({
        contract: "GnosisSafeProxy1_4_1",
        proxy,
        singleton: MASTER_COPIES.V1_4_1_L1 as `0x${string}`,
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    expect(safe.masterCopy).toBe(MASTER_COPIES.V1_4_1_L1);
    expect(safe.version).toBe("V1_4_1");
  });
});
