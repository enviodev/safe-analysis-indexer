import { describe, it, expect, beforeEach } from "vitest";
import { addr, safeId, MASTER_COPIES, LEGACY_V1_0_0_PROXY } from "./fixtures/addresses";
import {
  createIndexer,
  processOnChain,
  setEffectFixtures,
  clearEffectFixtures,
} from "./fixtures/indexer";
import {
  simulateProxyCreationPre1_3_0,
  simulateProxyCreationModern,
  simulateSafeSetup,
  resetBlockCounter,
} from "./fixtures/events";
import { expectSafeCount } from "./fixtures/assertions";

const CHAIN_ID = 1;

beforeEach(() => {
  clearEffectFixtures();
  resetBlockCounter();
});

describe("ProxyCreation — pre-1.3.0", () => {
  it("LEGACY_V1_0_0_PROXY shortcut sets version V1_0_0 without trace lookup", async () => {
    const indexer = createIndexer();
    await processOnChain(indexer, CHAIN_ID, [
      simulateProxyCreationPre1_3_0({
        proxy: LEGACY_V1_0_0_PROXY as `0x${string}`,
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, LEGACY_V1_0_0_PROXY));
    expect(safe.version).toBe("V1_0_0");
    // masterCopy stays undefined because the legacy shortcut bypasses the
    // trace lookup entirely.
    expect(safe.masterCopy).toBeUndefined();
    await expectSafeCount(indexer, {
      global: 1,
      chainId: CHAIN_ID,
      network: 1,
      version: "V1_0_0",
      versionCount: 1,
    });
  });

  it("UNKNOWN version is refined via masterCopy trace fixture", async () => {
    const proxy = addr("pre-13-proxy");
    const factory = addr("pre-13-factory");
    setEffectFixtures({
      getMasterCopyFromTrace: {
        [JSON.stringify({
          chainId: CHAIN_ID,
          blockNumber: 2,
          txHash:
            "0xfcbe6cda47ac1f81dc94e16c8c00fb09b58c54b4a26d6e0a4f3f23ce2b9c2da3",
          factoryAddress: factory,
        })]: MASTER_COPIES.V1_2_0,
      },
    });

    const indexer = createIndexer();
    await processOnChain(indexer, CHAIN_ID, [
      simulateProxyCreationPre1_3_0({
        proxy,
        factoryAddress: factory,
        block: { number: 2 },
        tx: {
          hash: "0xfcbe6cda47ac1f81dc94e16c8c00fb09b58c54b4a26d6e0a4f3f23ce2b9c2da3",
        },
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    expect(safe.version).toBe("V1_2_0");
    expect(safe.masterCopy).toBe(MASTER_COPIES.V1_2_0);
  });

  it("unrecognized trace masterCopy → version stays UNKNOWN but masterCopy is persisted (lowercase)", async () => {
    const proxy = addr("pre-13-unknown");
    const factory = addr("pre-13-factory-2");
    const unrecognized = "0xDEADBEEFcafebabeDEADBEEFcafebabeDEADBEEF";
    setEffectFixtures({
      getMasterCopyFromTrace: {
        [JSON.stringify({
          chainId: CHAIN_ID,
          blockNumber: 2,
          txHash:
            "0xaaaaaaaacafebabeaaaaaaaacafebabeaaaaaaaacafebabeaaaaaaaacafebabe",
          factoryAddress: factory,
        })]: unrecognized,
      },
    });

    const indexer = createIndexer();
    await processOnChain(indexer, CHAIN_ID, [
      simulateProxyCreationPre1_3_0({
        proxy,
        factoryAddress: factory,
        block: { number: 2 },
        tx: {
          hash: "0xaaaaaaaacafebabeaaaaaaaacafebabeaaaaaaaacafebabeaaaaaaaacafebabe",
        },
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    expect(safe.version).toBe("UNKNOWN");
    expect(safe.masterCopy).toBe(unrecognized.toLowerCase());
  });
});

describe("ProxyCreation — modern (1.3.0 / 1.4.1 / 1.5.0)", () => {
  it("v1.3.0 ProxyCreation with known L2 singleton → version V1_3_0, lowercase masterCopy", async () => {
    const indexer = createIndexer();
    const proxy = addr("modern-13");
    await processOnChain(indexer, CHAIN_ID, [
      simulateProxyCreationModern({
        contract: "GnosisSafeProxy1_3_0",
        proxy,
        singleton: MASTER_COPIES.V1_3_0_L2 as `0x${string}`,
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    expect(safe.version).toBe("V1_3_0");
    expect(safe.masterCopy).toBe(MASTER_COPIES.V1_3_0_L2);
  });

  it("v1.4.1 ProxyCreation with unknown singleton → falls back to factory-implied V1_4_1", async () => {
    const indexer = createIndexer();
    const proxy = addr("modern-14");
    const unknownSingleton = addr("unknown-singleton");
    await processOnChain(indexer, CHAIN_ID, [
      simulateProxyCreationModern({
        contract: "GnosisSafeProxy1_4_1",
        proxy,
        singleton: unknownSingleton,
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    expect(safe.version).toBe("V1_4_1");
    expect(safe.masterCopy).toBe(unknownSingleton);
  });

  it("v1.5.0 ProxyCreation with L1 singleton resolves V1_5_0 and is an L1 Safe", async () => {
    const indexer = createIndexer();
    const proxy = addr("modern-15-l1");
    await processOnChain(indexer, CHAIN_ID, [
      simulateProxyCreationModern({
        contract: "GnosisSafeProxy1_5_0",
        proxy,
        singleton: MASTER_COPIES.V1_5_0_L1 as `0x${string}`,
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    expect(safe.version).toBe("V1_5_0");
    expect(safe.masterCopy).toBe(MASTER_COPIES.V1_5_0_L1);
    // No direct isL1Safe(safe) here because it's tested in pureFns; what we
    // pin is that the masterCopy is in the L1 set.
  });
});

describe("SafeSetup ↔ ProxyCreation ordering (1.3.0+)", () => {
  it("SafeSetup-then-ProxyCreation: final Safe merges owners/threshold from SafeSetup + version/masterCopy/creationTxHash from ProxyCreation", async () => {
    const indexer = createIndexer();
    const proxy = addr("merge-1");
    const ownerA = addr("merge-owner-a");
    const ownerB = addr("merge-owner-b");

    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeSetup({
        safeAddress: proxy,
        owners: [ownerA, ownerB],
        threshold: 2n,
      }),
      simulateProxyCreationModern({
        contract: "GnosisSafeProxy1_3_0",
        proxy,
        singleton: MASTER_COPIES.V1_3_0_L2 as `0x${string}`,
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    expect(safe.owners).toEqual([ownerA, ownerB]);
    expect(safe.threshold).toBe(2);
    expect(safe.version).toBe("V1_3_0");
    expect(safe.masterCopy).toBe(MASTER_COPIES.V1_3_0_L2);
  });

  it("ProxyCreation-then-SafeSetup: same final merged state", async () => {
    const indexer = createIndexer();
    const proxy = addr("merge-2");
    const ownerA = addr("merge-2-a");

    await processOnChain(indexer, CHAIN_ID, [
      simulateProxyCreationModern({
        contract: "GnosisSafeProxy1_3_0",
        proxy,
        singleton: MASTER_COPIES.V1_3_0_L2 as `0x${string}`,
      }),
      simulateSafeSetup({ safeAddress: proxy, owners: [ownerA], threshold: 1n }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    expect(safe.owners).toEqual([ownerA]);
    expect(safe.threshold).toBe(1);
    expect(safe.version).toBe("V1_3_0");
  });

  it("SafeSetup alone creates a placeholder Safe with version UNKNOWN until ProxyCreation arrives", async () => {
    // SafeSetup carries no masterCopy / factory in its params, so the version
    // is genuinely unknown until ProxyCreation fires. UNKNOWN also marks the
    // Safe as uncounted so subsequent ChangedMasterCopy can short-circuit its
    // Version-stats reconciliation.
    const indexer = createIndexer();
    const proxy = addr("setup-only");
    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeSetup({
        safeAddress: proxy,
        owners: [addr("only-owner")],
        threshold: 1n,
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    expect(safe.version).toBe("UNKNOWN");
    expect(safe.masterCopy).toBeUndefined();
    expect(safe.owners).toEqual([addr("only-owner")]);
  });

  it("SafeSetup tolerates a readonly owners array (defensive [...owners] copy)", async () => {
    const indexer = createIndexer();
    const proxy = addr("readonly-owners");
    const owners = Object.freeze([addr("frozen-owner")]) as readonly `0x${string}`[];
    // Cast through unknown because the simulate builder type expects mutable
    // arrays — runtime path uses the defensive copy.
    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeSetup({
        safeAddress: proxy,
        owners: owners as unknown as `0x${string}`[],
        threshold: 1n,
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    expect(safe.owners).toEqual([addr("frozen-owner")]);
  });
});

describe("Safe creation counters", () => {
  it("single 1.3.0 ProxyCreation lands all three counters at 1", async () => {
    const indexer = createIndexer();
    await processOnChain(indexer, CHAIN_ID, [
      simulateProxyCreationModern({
        contract: "GnosisSafeProxy1_3_0",
        proxy: addr("count-1"),
        singleton: MASTER_COPIES.V1_3_0_L2 as `0x${string}`,
      }),
    ]);
    await expectSafeCount(indexer, {
      global: 1,
      chainId: CHAIN_ID,
      network: 1,
      version: "V1_3_0",
      versionCount: 1,
    });
  });

  it("two ProxyCreations on different chains: GlobalStats=2, per-Network=1 each", async () => {
    const indexer = createIndexer();
    await processOnChain(indexer, 1, [
      simulateProxyCreationModern({
        contract: "GnosisSafeProxy1_3_0",
        proxy: addr("count-multi-1"),
        singleton: MASTER_COPIES.V1_3_0_L2 as `0x${string}`,
      }),
    ]);
    await processOnChain(indexer, 100, [
      simulateProxyCreationModern({
        contract: "GnosisSafeProxy1_3_0",
        proxy: addr("count-multi-100"),
        singleton: MASTER_COPIES.V1_3_0_L2 as `0x${string}`,
      }),
    ]);

    await expectSafeCount(indexer, { global: 2 });
    await expectSafeCount(indexer, { chainId: 1, network: 1 });
    await expectSafeCount(indexer, { chainId: 100, network: 1 });
    await expectSafeCount(indexer, { version: "V1_3_0", versionCount: 2 });
  });
});

// Safe.creationTxFrom should always be tx.from (the account that submitted the
// deployment tx), not the SafeSetup.initiator event param (which is msg.sender
// of setup() = the factory contract). For directly-submitted deployments this
// matches Safe TX Service `/v1/safes/{addr}/creation/.creator`; for sponsored
// deployments (4337 bundlers, relayers) it diverges — see the schema comment.
describe("Safe.creationTxFrom = tx.from of the creation tx", () => {
  const EOA_CREATOR = "0x9c8a7e1b3d4f5a2c6e8b0d1f3a5c7e9b0d2f4a6c" as `0x${string}`;

  it("modern ProxyCreation records tx.from as creationTxFrom (lowercase)", async () => {
    const indexer = createIndexer();
    const proxy = addr("init-modern");
    await processOnChain(indexer, CHAIN_ID, [
      simulateProxyCreationModern({
        contract: "GnosisSafeProxy1_3_0",
        proxy,
        singleton: MASTER_COPIES.V1_3_0_L2 as `0x${string}`,
        tx: { from: EOA_CREATOR },
      }),
    ]);
    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    expect(safe.creationTxFrom).toBe(EOA_CREATOR.toLowerCase());
  });

  it("pre-1.3.0 ProxyCreation records tx.from as creationTxFrom", async () => {
    const indexer = createIndexer();
    await processOnChain(indexer, CHAIN_ID, [
      simulateProxyCreationPre1_3_0({
        proxy: LEGACY_V1_0_0_PROXY as `0x${string}`,
        tx: { from: EOA_CREATOR },
      }),
    ]);
    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, LEGACY_V1_0_0_PROXY));
    expect(safe.creationTxFrom).toBe(EOA_CREATOR.toLowerCase());
  });

  it("SafeSetup-first orphan records tx.from, NOT the SafeSetup.initiator event param", async () => {
    const indexer = createIndexer();
    const proxy = addr("init-setup-orphan");
    const factoryParam = "0xa6b71e26c5e0845f74c812102ca7114b6a896ab2" as `0x${string}`;

    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeSetup({
        safeAddress: proxy,
        owners: [addr("orphan-owner")],
        threshold: 1n,
        // SafeSetup.initiator event param is the factory in real-world deploys —
        // we should NOT store this, we should store tx.from instead.
        initiator: factoryParam,
        tx: { from: EOA_CREATOR },
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    expect(safe.creationTxFrom).toBe(EOA_CREATOR.toLowerCase());
    expect(safe.creationTxFrom).not.toBe(factoryParam.toLowerCase());
  });

  it("ProxyCreation then SafeSetup: tx.from from BOTH events resolves to the same EOA (same tx)", async () => {
    const indexer = createIndexer();
    const proxy = addr("init-merge");
    await processOnChain(indexer, CHAIN_ID, [
      simulateProxyCreationModern({
        contract: "GnosisSafeProxy1_3_0",
        proxy,
        singleton: MASTER_COPIES.V1_3_0_L2 as `0x${string}`,
        tx: { from: EOA_CREATOR },
      }),
      simulateSafeSetup({
        safeAddress: proxy,
        owners: [addr("merged-owner")],
        threshold: 1n,
        tx: { from: EOA_CREATOR },
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    expect(safe.creationTxFrom).toBe(EOA_CREATOR.toLowerCase());
  });
});
