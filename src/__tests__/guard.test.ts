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

  it("SafeSetup-first branch → guard is 0x0…0 (then preserved through ProxyCreation merge)", async () => {
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
  it("is a no-op when the Safe doesn't exist", async () => {
    const indexer = createIndexer();
    await processOnChain(indexer, CHAIN_ID, [
      simulateChangedGuard({
        safeAddress: addr("ghost-guard"),
        guard: addr("new-guard-x"),
      }),
    ]);
    expect(await indexer.Safe.getAll()).toEqual([]);
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

  it("is a no-op when the Safe doesn't exist", async () => {
    const indexer = createIndexer();
    await processOnChain(indexer, CHAIN_ID, [
      simulateChangedGuard({
        safeAddress: addr("ghost-guard-v4"),
        guard: addr("ghost-guard-val"),
        v4: true,
      }),
    ]);
    expect(await indexer.Safe.getAll()).toEqual([]);
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
