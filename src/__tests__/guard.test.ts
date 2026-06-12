import { describe, it, expect } from "vitest";
import { zeroAddress } from "viem";
import { addr, MASTER_COPIES, safeId, LEGACY_V1_0_0_PROXY } from "./fixtures/addresses";
import {
  createIndexer,
  processOnChain,
  seedSafe,
} from "./fixtures/indexer";
import {
  simulateProxyCreationPre1_3_0,
  simulateProxyCreationModern,
  simulateSafeSetup,
  simulateChangedGuard,
  simulateChangedModuleGuard,
} from "./fixtures/events";

const CHAIN_ID = 1;

describe("Safe.guard defaults to the zero address on every creation path", () => {
  it("pre-1.3.0 ProxyCreation (LEGACY shortcut → V1_0_0) → guard is 0x0…0", async () => {
    const indexer = createIndexer();
    await processOnChain(indexer, CHAIN_ID, [
      simulateProxyCreationPre1_3_0({ proxy: LEGACY_V1_0_0_PROXY as `0x${string}` }),
    ]);
    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, LEGACY_V1_0_0_PROXY));
    expect(safe.version).toBe("V1_0_0");
    expect(safe.guard).toBe(zeroAddress);
  });

  it("modern ProxyCreation alone (placeholder branch) → guard is 0x0…0", async () => {
    const indexer = createIndexer();
    const proxy = addr("guard-modern-only");
    await processOnChain(indexer, CHAIN_ID, [
      simulateProxyCreationModern({
        contract: "GnosisSafeProxy1_3_0",
        proxy,
        singleton: MASTER_COPIES.V1_3_0_L2 as `0x${string}`,
      }),
    ]);
    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    expect(safe.guard).toBe(zeroAddress);
  });

  // SKIPPED-ENVIO-3.2: see creationContext.test.ts.
  it.skip("SafeSetup-first branch → guard is 0x0…0 (then preserved through ProxyCreation merge)", async () => {
    const indexer = createIndexer();
    const proxy = addr("guard-setup-first");
    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeSetup({
        safeAddress: proxy,
        owners: [addr("g-owner")],
        threshold: 1n,
      }),
      simulateProxyCreationModern({
        contract: "GnosisSafeProxy1_3_0",
        proxy,
        singleton: MASTER_COPIES.V1_3_0_L2 as `0x${string}`,
      }),
    ]);
    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    expect(safe.guard).toBe(zeroAddress);
  });
});

describe("ChangedGuard (v1.3.0 non-indexed)", () => {
  it("auto-stubs the Safe when ChangedGuard fires before SafeSetup / ProxyCreation", async () => {
    // setup()-time delegate-call setGuard inside a multiSend bundle would
    // emit ChangedGuard before SafeSetup. Wildcard handler stubs the Safe so
    // the guard state isn't dropped.
    const indexer = createIndexer();
    const safeAddr = addr("ghost-guard");
    const newGuard = addr("new-guard-x");
    await processOnChain(indexer, CHAIN_ID, [
      simulateChangedGuard({ safeAddress: safeAddr, guard: newGuard }),
    ]);
    const stub = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, safeAddr));
    expect(stub.guard).toBe(newGuard);
  });

  it("updates Safe.guard in place (lowercase, no other field touched)", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("guard-update-v3");
    const id = seedSafe(indexer, {
      chainId: CHAIN_ID,
      address: safeAddr,
      version: "V1_3_0",
      masterCopy: MASTER_COPIES.V1_3_0_L2,
    });

    const newGuard = "0xCaFeBaBeCaFeBaBeCaFeBaBeCaFeBaBeCaFeBaBe" as `0x${string}`;
    await processOnChain(indexer, CHAIN_ID, [
      simulateChangedGuard({ safeAddress: safeAddr, guard: newGuard }),
    ]);

    const safe = await indexer.Safe.getOrThrow(id);
    expect(safe.guard).toBe(newGuard.toLowerCase());
    expect(safe.version).toBe("V1_3_0");
    expect(safe.masterCopy).toBe(MASTER_COPIES.V1_3_0_L2);
  });

  it("clearing back to the zero address records 0x0…0 (not null, not skipped)", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("guard-clear");
    const id = seedSafe(indexer, {
      chainId: CHAIN_ID,
      address: safeAddr,
      guard: addr("some-guard"),
    });

    await processOnChain(indexer, CHAIN_ID, [
      simulateChangedGuard({ safeAddress: safeAddr, guard: zeroAddress as `0x${string}` }),
    ]);

    const safe = await indexer.Safe.getOrThrow(id);
    expect(safe.guard).toBe(zeroAddress);
  });
});

describe("ChangedGuardV4 (v1.4.0+ indexed)", () => {
  it("updates Safe.guard the same way as the non-indexed variant", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("guard-update-v4");
    const id = seedSafe(indexer, {
      chainId: CHAIN_ID,
      address: safeAddr,
      version: "V1_4_1",
      masterCopy: MASTER_COPIES.V1_4_1_L2,
    });

    const newGuard = addr("v4-new-guard");
    await processOnChain(indexer, CHAIN_ID, [
      simulateChangedGuard({ safeAddress: safeAddr, guard: newGuard, v4: true }),
    ]);

    const safe = await indexer.Safe.getOrThrow(id);
    expect(safe.guard).toBe(newGuard);
    expect(safe.version).toBe("V1_4_1");
  });

  it("auto-stubs the Safe for the V4 variant too when fired before setup", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("ghost-guard-v4");
    const newGuard = addr("ghost-guard-val");
    await processOnChain(indexer, CHAIN_ID, [
      simulateChangedGuard({ safeAddress: safeAddr, guard: newGuard, v4: true }),
    ]);
    const stub = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, safeAddr));
    expect(stub.guard).toBe(newGuard);
  });
});

describe("ChangedGuard sequence", () => {
  it("walks zero → A → B → zero", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("guard-sequence");
    const id = seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr });
    const guardA = addr("seq-a");
    const guardB = addr("seq-b");

    await processOnChain(indexer, CHAIN_ID, [
      simulateChangedGuard({ safeAddress: safeAddr, guard: guardA }),
      simulateChangedGuard({ safeAddress: safeAddr, guard: guardB }),
      simulateChangedGuard({ safeAddress: safeAddr, guard: zeroAddress as `0x${string}` }),
    ]);

    const safe = await indexer.Safe.getOrThrow(id);
    expect(safe.guard).toBe(zeroAddress);
  });
});

describe("Safe.moduleGuard (v1.5.0+ ChangedModuleGuard)", () => {
  it("defaults to the zero address on a freshly-created modern Safe", async () => {
    const indexer = createIndexer();
    const proxy = addr("modguard-default");
    await processOnChain(indexer, CHAIN_ID, [
      simulateProxyCreationModern({
        contract: "GnosisSafeProxy1_5_0",
        proxy,
        singleton: MASTER_COPIES.V1_5_0_L1 as `0x${string}`,
      }),
    ]);
    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    expect(safe.moduleGuard).toBe(zeroAddress);
  });

  it("ChangedModuleGuard updates Safe.moduleGuard in-place (lowercase)", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("modguard-update");
    const id = seedSafe(indexer, {
      chainId: CHAIN_ID,
      address: safeAddr,
      version: "V1_5_0",
      masterCopy: MASTER_COPIES.V1_5_0_L1,
    });

    const newModGuard = "0xCaFeBaBeCaFeBaBeCaFeBaBeCaFeBaBeCaFeBaBe" as `0x${string}`;
    await processOnChain(indexer, CHAIN_ID, [
      simulateChangedModuleGuard({ safeAddress: safeAddr, moduleGuard: newModGuard }),
    ]);

    const safe = await indexer.Safe.getOrThrow(id);
    expect(safe.moduleGuard).toBe(newModGuard.toLowerCase());
    // guard (the regular tx guard) untouched.
    expect(safe.guard).toBe(zeroAddress);
  });

  it("auto-stubs the Safe when ChangedModuleGuard fires before SafeSetup / ProxyCreation", async () => {
    // Same setup()-time delegate-call concern as the other GnosisSafeL2
    // wildcards: a multiSend bundle could call setModuleGuard inside setup()
    // before SafeSetup. Wildcard handler must create a stub Safe so the
    // moduleGuard isn't dropped.
    const indexer = createIndexer();
    const safeAddr = addr("modguard-pre-setup");
    const newModGuard = addr("modguard-handler-x");
    await processOnChain(indexer, CHAIN_ID, [
      simulateChangedModuleGuard({ safeAddress: safeAddr, moduleGuard: newModGuard }),
    ]);
    const stub = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, safeAddr));
    expect(stub.moduleGuard).toBe(newModGuard);
    expect(stub.counted).toBe(false); // orphan stub stays uncounted
  });
});
