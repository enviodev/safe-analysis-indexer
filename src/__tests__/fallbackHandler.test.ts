import { describe, it, expect, beforeEach } from "vitest";
import { ethers } from "ethers";
import { zeroAddress } from "viem";
import { SETUP_ABI_V1_1_1 } from "../consts";
import { addr, MASTER_COPIES, safeId } from "./fixtures/addresses";
import {
  createIndexer,
  processOnChain,
  seedSafe,
  setEffectFixtures,
  clearEffectFixtures,
} from "./fixtures/indexer";
import {
  simulateProxyCreationPre1_3_0,
  simulateProxyCreationModern,
  simulateSafeSetup,
  simulateChangedFallbackHandler,
} from "./fixtures/events";

const CHAIN_ID = 1;

beforeEach(() => clearEffectFixtures());

// Build a v1.1.1+ setup() calldata blob — used as the `getSetupTrace` fixture
// for pre-1.3.0 tests below.
function encodeV1_1_1Setup(owners: string[], threshold: number, fallback: string): string {
  return new ethers.Interface(SETUP_ABI_V1_1_1).encodeFunctionData("setup", [
    owners,
    threshold,
    zeroAddress,
    "0x",
    fallback,
    zeroAddress,
    0,
    zeroAddress,
  ]);
}

describe("SafeSetup (1.3.0+) populates Safe.fallbackHandler", () => {
  it("sets fallbackHandler from event params on a freshly placeheld Safe", async () => {
    const indexer = createIndexer();
    const proxy = addr("safesetup-fh");
    const fallback = addr("fh-on-setup");

    await processOnChain(indexer, CHAIN_ID, [
      simulateProxyCreationModern({
        contract: "GnosisSafeProxy1_3_0",
        proxy,
        singleton: MASTER_COPIES.V1_3_0_L2 as `0x${string}`,
      }),
      simulateSafeSetup({
        safeAddress: proxy,
        owners: [addr("setup-owner")],
        threshold: 1n,
        fallbackHandler: fallback,
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    expect(safe.fallbackHandler).toBe(fallback);
  });

  it("sets fallbackHandler when SafeSetup fires before ProxyCreation (placeholder branch)", async () => {
    const indexer = createIndexer();
    const proxy = addr("safesetup-fh-placeholder");
    const fallback = addr("fh-placeholder");

    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeSetup({
        safeAddress: proxy,
        owners: [addr("p-owner")],
        threshold: 1n,
        fallbackHandler: fallback,
      }),
      simulateProxyCreationModern({
        contract: "GnosisSafeProxy1_3_0",
        proxy,
        singleton: MASTER_COPIES.V1_3_0_L2 as `0x${string}`,
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    expect(safe.fallbackHandler).toBe(fallback);
  });

  it("SafeSetup with zero-address fallbackHandler still records the zero address (not null)", async () => {
    const indexer = createIndexer();
    const proxy = addr("safesetup-fh-zero");

    await processOnChain(indexer, CHAIN_ID, [
      simulateProxyCreationModern({
        contract: "GnosisSafeProxy1_3_0",
        proxy,
        singleton: MASTER_COPIES.V1_3_0_L2 as `0x${string}`,
      }),
      simulateSafeSetup({
        safeAddress: proxy,
        owners: [addr("z-owner")],
        threshold: 1n,
        fallbackHandler: zeroAddress as `0x${string}`,
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    expect(safe.fallbackHandler).toBe(zeroAddress);
  });
});

describe("Pre-1.3.0 ProxyCreation derives fallbackHandler from initializer", () => {
  it("v1.1.1+ ABI initializer → fallbackHandler is populated", async () => {
    const proxy = addr("pre13-fh");
    const factory = addr("pre13-factory-fh");
    const fallback = addr("pre13-fallback");
    const txHash = "0xfa11bac3a11bac3a11bac3a11bac3a11bac3a11bac3a11bac3a11bac3a11bac3";

    const setupCalldata = encodeV1_1_1Setup([addr("pre-owner")], 1, fallback);

    setEffectFixtures({
      // Force "UNKNOWN" → V1_1_1 via masterCopy resolution so decodeSetupInput
      // uses the v1.1.1 ABI when parsing the setup trace.
      getMasterCopyFromTrace: {
        [JSON.stringify({
          chainId: CHAIN_ID,
          blockNumber: 2,
          txHash,
          factoryAddress: factory,
        })]: MASTER_COPIES.V1_1_1,
      },
      getSetupTrace: {
        [JSON.stringify({
          chainId: CHAIN_ID,
          blockNumber: 2,
          proxyAddress: proxy,
          // Effect input expects the internal SafeVersion enum, not the
          // STS-format string. getSetupTrace uses it to look up the right
          // setup() ABI.
          version: "V1_1_1",
        })]: setupCalldata,
      },
    });

    const indexer = createIndexer();
    await processOnChain(indexer, CHAIN_ID, [
      simulateProxyCreationPre1_3_0({
        proxy,
        factoryAddress: factory,
        block: { number: 2 },
        tx: { hash: txHash },
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    expect(safe.version).toBe("V1_1_1");
    expect(safe.fallbackHandler).toBe(fallback);
  });

  it("legacy V1_0_0 ABI → fallbackHandler stays undefined (legacy, unknown)", async () => {
    const indexer = createIndexer();
    // LEGACY shortcut hits the V1_0_0 branch unconditionally; getSetupTrace
    // returns null (no fixture), so decodeSetupInput is never invoked. The
    // Safe is created with fallbackHandler undefined.
    await processOnChain(indexer, CHAIN_ID, [
      simulateProxyCreationPre1_3_0({
        // LEGACY_V1_0_0_PROXY hard-coded shortcut
        proxy: "0x12302fe9c02ff50939baaaf415fc226c078613c" as `0x${string}`,
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(
      safeId(CHAIN_ID, "0x12302fe9c02ff50939baaaf415fc226c078613c"),
    );
    expect(safe.version).toBe("V1_0_0");
    expect(safe.fallbackHandler).toBeUndefined();
  });
});

describe("ChangedFallbackHandler (v1.3.0 non-indexed)", () => {
  it("auto-stubs the Safe when ChangedFallbackHandler fires before SafeSetup / ProxyCreation", async () => {
    // Same pre-setup wildcard pattern as EnabledModule — a setup()-time
    // delegate-call could emit ChangedFallbackHandler ahead of SafeSetup.
    const indexer = createIndexer();
    const safeAddr = addr("ghost-fh");
    const newHandler = addr("new-handler-x");
    await processOnChain(indexer, CHAIN_ID, [
      simulateChangedFallbackHandler({ safeAddress: safeAddr, handler: newHandler }),
    ]);
    const stub = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, safeAddr));
    expect(stub.fallbackHandler).toBe(newHandler);
  });

  it("updates Safe.fallbackHandler in-place (lowercase, no other field touched)", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("fh-update");
    const id = seedSafe(indexer, {
      chainId: CHAIN_ID,
      address: safeAddr,
      version: "V1_3_0",
      masterCopy: MASTER_COPIES.V1_3_0_L2,
      fallbackHandler: addr("old-handler"),
    });

    const newHandler = "0xCaFeBaBeCaFeBaBeCaFeBaBeCaFeBaBeCaFeBaBe" as `0x${string}`;
    await processOnChain(indexer, CHAIN_ID, [
      simulateChangedFallbackHandler({ safeAddress: safeAddr, handler: newHandler }),
    ]);

    const safe = await indexer.Safe.getOrThrow(id);
    expect(safe.fallbackHandler).toBe(newHandler.toLowerCase());
    // Other fields unchanged
    expect(safe.version).toBe("V1_3_0");
    expect(safe.masterCopy).toBe(MASTER_COPIES.V1_3_0_L2);
  });

  it("updates from undefined to a concrete handler", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("fh-from-undefined");
    const id = seedSafe(indexer, {
      chainId: CHAIN_ID,
      address: safeAddr,
      // no fallbackHandler — seeded as undefined
    });

    const newHandler = addr("brand-new-handler");
    await processOnChain(indexer, CHAIN_ID, [
      simulateChangedFallbackHandler({ safeAddress: safeAddr, handler: newHandler }),
    ]);

    const safe = await indexer.Safe.getOrThrow(id);
    expect(safe.fallbackHandler).toBe(newHandler);
  });

  it("ChangedFallbackHandler before SafeSetup wins — SafeSetup's initial arg must not clobber it (4337 install pattern)", async () => {
    // Repro for the production bug surfaced on Safe
    // 0xd765df…ac304c09 (chain 1, ETH mainnet). Real on-chain log order:
    //   [0] EnabledModule(0xa581c4a4…)           ← from setup()-time delegate-call
    //   [1] ChangedFallbackHandler(0xa581c4a4…)  ← also delegate-call (4337 install)
    //   [4] SafeSetup(…, fallbackHandler=0x0…0)  ← SafeSetup reports the INITIAL
    //                                              setup() arg, NOT the post-
    //                                              delegate-call state
    // Pre-fix the SafeSetup handler unconditionally overwrote fallbackHandler
    // with the SafeSetup arg, clobbering the ChangedFallbackHandler-set value
    // and leaving the indexer at fallbackHandler=0x0…0. Fix: preserve any
    // already-set fallbackHandler on the SafeSetup existing-safe branch.
    const indexer = createIndexer();
    const safeAddr = addr("fh-clobber-bug");
    const finalHandler = "0xa581c4a4db7175302464ff3c06380bc3270b4037" as `0x${string}`;
    await processOnChain(indexer, CHAIN_ID, [
      simulateChangedFallbackHandler({
        safeAddress: safeAddr,
        handler: finalHandler,
      }),
      simulateSafeSetup({
        safeAddress: safeAddr,
        owners: [addr("fh-clobber-owner")],
        threshold: 1n,
        // SafeSetup reports the INITIAL setup() arg (zero), which would
        // clobber the ChangedFallbackHandler-set finalHandler without the fix.
        fallbackHandler: zeroAddress as `0x${string}`,
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, safeAddr));
    expect(safe.fallbackHandler).toBe(finalHandler);
  });

  it("SafeSetup sets fallbackHandler on the existing-safe branch when it's still undefined", async () => {
    // Counterpart to the test above: if no setup-time delegate-call touched
    // fallbackHandler before SafeSetup, the existing entity's
    // fallbackHandler is undefined (just a stub from a state event like
    // EnabledModule). SafeSetup should populate it from its arg.
    const indexer = createIndexer();
    const safeAddr = addr("fh-stub-then-setup");
    const handlerFromSetup = "0xcafebabecafebabecafebabecafebabecafebabe" as `0x${string}`;
    // No prior ChangedFallbackHandler — only an EnabledModule to create the stub.
    const { simulateEnabledModule } = await import("./fixtures/events");
    await processOnChain(indexer, CHAIN_ID, [
      simulateEnabledModule({
        safeAddress: safeAddr,
        module: addr("some-mod"),
        v4: true,
      }),
      simulateSafeSetup({
        safeAddress: safeAddr,
        owners: [addr("fh-stub-owner")],
        threshold: 1n,
        fallbackHandler: handlerFromSetup,
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, safeAddr));
    expect(safe.fallbackHandler).toBe(handlerFromSetup.toLowerCase());
  });
});

// Regression for the production gap where only the indexed (v1.4.0+) variant
// was subscribed: v1.3.0 Safes emit the NON-indexed ChangedFallbackHandler
// (covered by the block above), and on-chain cross-referencing found Safes
// whose fallbackHandler had gone stale because their change event was dropped.
// The config now subscribes to both variants; this block locks in the indexed
// handler. (Topic-level filtering can't be exercised by the simulator — see the
// note in indexer.ts — so codegen + these handlers passing is what proves both
// variants are wired.)
describe("ChangedFallbackHandlerV4 (v1.4.0+ indexed)", () => {
  it("indexed variant updates Safe.fallbackHandler in-place", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("fh-update-v4");
    const id = seedSafe(indexer, {
      chainId: CHAIN_ID,
      address: safeAddr,
      version: "V1_4_1",
      fallbackHandler: addr("old-handler-v4"),
    });

    const newHandler = "0xBeefBeefBeefBeefBeefBeefBeefBeefBeefBeef" as `0x${string}`;
    await processOnChain(indexer, CHAIN_ID, [
      simulateChangedFallbackHandler({ safeAddress: safeAddr, handler: newHandler, v4: true }),
    ]);

    const safe = await indexer.Safe.getOrThrow(id);
    expect(safe.fallbackHandler).toBe(newHandler.toLowerCase());
    expect(safe.version).toBe("V1_4_1");
  });

  it("auto-stubs the Safe when the indexed variant fires before SafeSetup / ProxyCreation", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("ghost-fh-v4");
    const newHandler = addr("new-handler-v4");
    await processOnChain(indexer, CHAIN_ID, [
      simulateChangedFallbackHandler({ safeAddress: safeAddr, handler: newHandler, v4: true }),
    ]);
    const stub = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, safeAddr));
    expect(stub.fallbackHandler).toBe(newHandler);
  });
});
