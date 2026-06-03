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
    expect(safe.version).toBe("V1_3_0_L2");
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

describe("ProxyCreation — setupData backfill from tx.input", () => {
  // Selector for createProxyWithNonce(address,bytes,uint256). Same across
  // v1.3.0 / v1.4.1 / v1.5.0 (the event shape changed, not the factory fn).
  const factoryAbi = [
    "function createProxyWithNonce(address _mastercopy, bytes memory initializer, uint256 saltNonce) returns (address proxy)",
  ];
  // Imported lazily inside `it` to avoid hoisting top-of-file deps.
  function encodeFactoryCall(initializer: string, singleton: string): string {
    // Inline ethers Interface use — pureFns.test.ts already exercises the
    // happy-path decode against the same encoder, this just wires it into
    // the handler path.
    const { Interface } = require("ethers");
    return new Interface(factoryAbi).encodeFunctionData("createProxyWithNonce", [
      singleton,
      initializer,
      0n,
    ]);
  }

  it("v1.4.1 ProxyCreation with a real createProxyWithNonce calldata → setupData populated", async () => {
    const indexer = createIndexer();
    const proxy = addr("setupdata-direct");
    const initializer = "0xb63e800d" + "00".repeat(32 * 8); // arbitrary plausible setup() blob
    const txInput = encodeFactoryCall(initializer, MASTER_COPIES.V1_4_1_L2);

    await processOnChain(indexer, CHAIN_ID, [
      simulateProxyCreationModern({
        contract: "GnosisSafeProxy1_4_1",
        proxy,
        singleton: MASTER_COPIES.V1_4_1_L2 as `0x${string}`,
        tx: { input: txInput },
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    expect(safe.setupData).toBe(initializer);
  });

  it("v1.3.0 direct factory call: setupData populated identically (one decoder covers all modern versions)", async () => {
    const indexer = createIndexer();
    const proxy = addr("setupdata-v13");
    const initializer = "0xdeadbeef";
    const txInput = encodeFactoryCall(initializer, MASTER_COPIES.V1_3_0_L2);

    await processOnChain(indexer, CHAIN_ID, [
      simulateProxyCreationModern({
        contract: "GnosisSafeProxy1_3_0",
        proxy,
        singleton: MASTER_COPIES.V1_3_0_L2 as `0x${string}`,
        tx: { input: txInput },
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    expect(safe.setupData).toBe(initializer);
  });

  it("wrapped tx.input (e.g. 4337 handleOps): setupData stays undefined — incremental wrapper support is future work", async () => {
    const indexer = createIndexer();
    const proxy = addr("setupdata-wrapped");
    // Not a createProxyWithNonce selector — could be handleOps, MultiSend,
    // Gelato sponsoredCall, etc. The decoder must not invent bytes for
    // these; consumers can fall back to Safe TX Service.
    const wrappedInput = "0x765e827f" + "00".repeat(128);

    await processOnChain(indexer, CHAIN_ID, [
      simulateProxyCreationModern({
        contract: "GnosisSafeProxy1_4_1",
        proxy,
        singleton: MASTER_COPIES.V1_4_1_L2 as `0x${string}`,
        tx: { input: wrappedInput },
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    expect(safe.setupData).toBeUndefined();
  });

  it("missing tx.input (no transaction_fields wired): setupData stays undefined, no crash", async () => {
    const indexer = createIndexer();
    const proxy = addr("setupdata-missing-input");

    await processOnChain(indexer, CHAIN_ID, [
      simulateProxyCreationModern({
        contract: "GnosisSafeProxy1_4_1",
        proxy,
        singleton: MASTER_COPIES.V1_4_1_L2 as `0x${string}`,
        // No tx.input override — the simulate builder defaults to "0x".
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    expect(safe.setupData).toBeUndefined();
  });

  it("SafeSetup-then-ProxyCreation: ProxyCreation's tx.input is decoded and stored, even though the entity existed first", async () => {
    // Models the canonical log order (SafeSetup at log[N], ProxyCreation at
    // log[N+M]) — we want setupData on the entity by the time the dust
    // settles, regardless of which event got there first.
    const indexer = createIndexer();
    const proxy = addr("setupdata-after-setup");
    const initializer = "0xb63e800d" + "ab".repeat(64);
    const txInput = encodeFactoryCall(initializer, MASTER_COPIES.V1_3_0_L2);

    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeSetup({
        safeAddress: proxy,
        owners: [addr("setupdata-owner")],
        threshold: 1n,
      }),
      simulateProxyCreationModern({
        contract: "GnosisSafeProxy1_3_0",
        proxy,
        singleton: MASTER_COPIES.V1_3_0_L2 as `0x${string}`,
        tx: { input: txInput },
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    expect(safe.setupData).toBe(initializer);
  });
});

describe("ProxyCreation — `creator` trace-walk (CREATOR_TRACE_CHAINS)", () => {
  // CREATOR_TRACE_CHAINS = { 1: Ethereum mainnet, 100: Gnosis }.
  const ETH_MAINNET = 1;
  const GNOSIS = 100;

  it("chain=1 with a trace fixture: creator resolves to the trace-walked address (NOT tx.from)", async () => {
    // Models a 4337 deployment on Ethereum: bundler is tx.from, but the
    // actual address that called the factory was SenderCreator. Safe TX
    // Service reports SenderCreator as `creator`; with the trace walk wired
    // up we should match.
    const proxy = addr("creator-trace-eth");
    const bundler = addr("creator-bundler");
    const senderCreator = "0xefc2c1444ebcc4db75e7613d20c6a62ff67a167c";
    const creationTxHash = "0xcafe000000000000000000000000000000000000000000000000000000000001";

    setEffectFixtures({
      getSafeCreatorViaTraceTransaction: {
        [JSON.stringify({
          chainId: ETH_MAINNET,
          txHash: creationTxHash,
          safeAddress: proxy,
        })]: senderCreator,
      },
    });

    const indexer = createIndexer();
    await processOnChain(indexer, ETH_MAINNET, [
      simulateProxyCreationModern({
        contract: "GnosisSafeProxy1_4_1",
        proxy,
        singleton: MASTER_COPIES.V1_4_1_L2 as `0x${string}`,
        tx: { from: bundler, hash: creationTxHash },
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(ETH_MAINNET, proxy));
    expect(safe.creator).toBe(senderCreator);
    // `creationTxFrom` remains tx.from for consumers that want the raw value.
    expect(safe.creationTxFrom).toBe(bundler);
  });

  it("chain=1 with no trace fixture (RPC returned null): creator falls back to creationTxFrom", async () => {
    const proxy = addr("creator-trace-eth-null");
    const txFrom = addr("creator-eth-null-from");

    // No fixture set → lookupFixture returns null → effect returns null →
    // resolveCreator falls back to creationTxFrom.
    const indexer = createIndexer();
    await processOnChain(indexer, ETH_MAINNET, [
      simulateProxyCreationModern({
        contract: "GnosisSafeProxy1_3_0",
        proxy,
        singleton: MASTER_COPIES.V1_3_0_L2 as `0x${string}`,
        tx: { from: txFrom },
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(ETH_MAINNET, proxy));
    expect(safe.creator).toBe(txFrom);
  });

  it("chain=100 (Gnosis): trace walk fires too — creator resolves to the trace-walked address", async () => {
    // Gnosis has full trace_transaction support (Erigon / Nethermind), so we
    // run the same trace walk as on Ethereum mainnet. This is the integration
    // bucket that matters most in practice — every test run sees ~8 chain-100
    // 4337 deploys that need this to match Safe TX Service.
    const proxy = addr("creator-trace-gno");
    const bundler = addr("creator-gno-bundler");
    const senderCreator = "0xefc2c1444ebcc4db75e7613d20c6a62ff67a167c";
    const creationTxHash = "0xcafe000000000000000000000000000000000000000000000000000000000064";

    setEffectFixtures({
      getSafeCreatorViaTraceTransaction: {
        [JSON.stringify({
          chainId: GNOSIS,
          txHash: creationTxHash,
          safeAddress: proxy,
        })]: senderCreator,
      },
    });

    const indexer = createIndexer();
    await processOnChain(indexer, GNOSIS, [
      simulateProxyCreationModern({
        contract: "GnosisSafeProxy1_4_1",
        proxy,
        singleton: MASTER_COPIES.V1_4_1_L2 as `0x${string}`,
        tx: { from: bundler, hash: creationTxHash },
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(GNOSIS, proxy));
    expect(safe.creator).toBe(senderCreator);
    expect(safe.creationTxFrom).toBe(bundler); // raw tx.from preserved
  });

  // Gate-off coverage (chain NOT in CREATOR_TRACE_CHAINS → fallback) isn't
  // exercised here because both currently-configured chains (1, 100) are
  // in the set. The gate is a one-line set membership check in
  // `resolveCreator`; once a new chain is added to config without being
  // added to CREATOR_TRACE_CHAINS, the existing fallback tests for
  // missing/null fixtures will exercise the same code path.

  it("SafeSetup orphan (no ProxyCreation): trace walk fires from the SafeSetup handler on chain=1", async () => {
    // Models a 3rd-party-factory deployment on Ethereum where ProxyCreation
    // never reaches us but SafeSetup does (caught via wildcard). The trace
    // walk runs in the SafeSetup orphan branch and gives us a creator that
    // matches what Safe TX Service would report.
    const proxy = addr("creator-trace-orphan");
    const txFrom = addr("creator-orphan-from");
    const wrapper = addr("creator-orphan-wrapper");
    const creationTxHash = "0xcafe000000000000000000000000000000000000000000000000000000000002";

    setEffectFixtures({
      getSafeCreatorViaTraceTransaction: {
        [JSON.stringify({
          chainId: ETH_MAINNET,
          txHash: creationTxHash,
          safeAddress: proxy,
        })]: wrapper,
      },
    });

    const indexer = createIndexer();
    await processOnChain(indexer, ETH_MAINNET, [
      simulateSafeSetup({
        safeAddress: proxy,
        owners: [addr("creator-orphan-owner")],
        threshold: 1n,
        tx: { from: txFrom, hash: creationTxHash },
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(ETH_MAINNET, proxy));
    expect(safe.creator).toBe(wrapper);
    expect(safe.counted).toBe(false); // orphan path still uncounted
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
    expect(safe.version).toBe("V1_3_0_L2");
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
    expect(safe.version).toBe("V1_3_0_L2");
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

  it("orphan SafeSetup + RPC returns known masterCopy → version and masterCopy backfilled", async () => {
    // Models 3rd-party-factory deployments: SafeSetup fires (wildcard catches
    // it) but ProxyCreation never arrives because the factory isn't in our
    // subscriptions. The RPC backfill reads slot 0 of the proxy's storage
    // (which holds the singleton address) and resolves the version. ~15K
    // such Safes observed in the live indexer on Gnosis.
    const proxy = addr("orphan-rpc-known");
    setEffectFixtures({
      getSafeMasterCopyViaRpc: {
        [JSON.stringify({ chainId: CHAIN_ID, safeAddress: proxy })]:
          MASTER_COPIES.V1_3_0_L2,
      },
    });

    const indexer = createIndexer();
    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeSetup({
        safeAddress: proxy,
        owners: [addr("orphan-owner")],
        threshold: 1n,
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    expect(safe.version).toBe("V1_3_0_L2");
    expect(safe.masterCopy).toBe(MASTER_COPIES.V1_3_0_L2);
    // factoryAddress stays null — RPC reads storage, not the factory.
    expect(safe.factoryAddress).toBeUndefined();
  });

  it("orphan SafeSetup + RPC returns unrecognized singleton → masterCopy stored, version stays UNKNOWN", async () => {
    // The RPC succeeds but the returned singleton isn't in MASTER_COPIES.
    // Store the masterCopy verbatim (it's still useful info) but leave the
    // version UNKNOWN so it doesn't get phantom-counted as a known version.
    const proxy = addr("orphan-rpc-unknown");
    const exoticSingleton = "0xdeadbeefcafebabedeadbeefcafebabedeadbeef";
    setEffectFixtures({
      getSafeMasterCopyViaRpc: {
        [JSON.stringify({ chainId: CHAIN_ID, safeAddress: proxy })]:
          exoticSingleton,
      },
    });

    const indexer = createIndexer();
    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeSetup({
        safeAddress: proxy,
        owners: [addr("exotic-owner")],
        threshold: 1n,
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    expect(safe.masterCopy).toBe(exoticSingleton);
    expect(safe.version).toBe("UNKNOWN");
  });

  it("ProxyCreation-then-SafeSetup: existing safe with populated masterCopy → RPC skipped, value preserved", async () => {
    // When ProxyCreation runs before SafeSetup (rare but possible if the
    // batch arrives that way), the existing safe already has masterCopy.
    // SafeSetup's RPC short-circuit must skip the call — wire a fixture that
    // would return a WRONG masterCopy and assert it wasn't applied.
    const proxy = addr("setup-after-proxy");
    const wrongSingleton = "0xbaaaaaadbaaaaaadbaaaaaadbaaaaaadbaaaaaad";
    setEffectFixtures({
      getSafeMasterCopyViaRpc: {
        [JSON.stringify({ chainId: CHAIN_ID, safeAddress: proxy })]:
          wrongSingleton,
      },
    });

    const indexer = createIndexer();
    await processOnChain(indexer, CHAIN_ID, [
      simulateProxyCreationModern({
        contract: "GnosisSafeProxy1_3_0",
        proxy,
        singleton: MASTER_COPIES.V1_3_0_L2 as `0x${string}`,
      }),
      simulateSafeSetup({
        safeAddress: proxy,
        owners: [addr("post-proxy-owner")],
        threshold: 1n,
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    // ProxyCreation's singleton param wins — the RPC fixture was wrong but
    // never consulted because masterCopy was already populated.
    expect(safe.masterCopy).toBe(MASTER_COPIES.V1_3_0_L2);
    expect(safe.version).toBe("V1_3_0_L2");
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
      version: "V1_3_0_L2",
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
    await expectSafeCount(indexer, { version: "V1_3_0_L2", versionCount: 2 });
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
