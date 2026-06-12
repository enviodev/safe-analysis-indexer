import { describe, it, expect } from "vitest";
import { addr, MASTER_COPIES, safeId } from "./fixtures/addresses";
import {
  createIndexer,
  processOnChain,
  seedSafe,
} from "./fixtures/indexer";
import {
  simulateEnabledModule,
  simulateDisabledModule,
  simulateSafeSetup,
  simulateProxyCreationModern,
} from "./fixtures/events";

const CHAIN_ID = 1;

describe("EnabledModule (pre-1.4.0, non-indexed)", () => {
  it("auto-stubs the Safe and records the SafeModule when EnabledModule fires before SafeSetup / ProxyCreation", async () => {
    // The canonical setup()-time delegate-call sequence: an inner multiSend
    // emits EnabledModule on the (future) Safe address ahead of SafeSetup and
    // ProxyCreation. The wildcard handler creates a stub Safe so the
    // SafeModule row has a valid FK; later SafeSetup / ProxyCreation enrich
    // the stub. This is the bug Safe's 4337 module installer surfaces.
    const indexer = createIndexer();
    const safeAddr = addr("ghost-mod-safe");
    const moduleAddr = addr("ghost-mod");
    await processOnChain(indexer, CHAIN_ID, [
      simulateEnabledModule({ safeAddress: safeAddr, module: moduleAddr }),
    ]);
    const id = safeId(CHAIN_ID, safeAddr);
    const row = await indexer.SafeModule.getOrThrow(`${id}-${moduleAddr}`);
    expect(row.safe_id).toBe(id);
    expect(row.module).toBe(moduleAddr);
    const stub = await indexer.Safe.getOrThrow(id);
    expect(stub.address).toBe(safeAddr);
  });

  it("creates a SafeModule row on a known Safe", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("mod-known");
    const id = seedSafe(indexer, {
      chainId: CHAIN_ID,
      address: safeAddr,
      version: "V1_3_0",
      masterCopy: MASTER_COPIES.V1_3_0_L2,
    });
    const moduleAddr = addr("mod-A");

    await processOnChain(indexer, CHAIN_ID, [
      simulateEnabledModule({ safeAddress: safeAddr, module: moduleAddr }),
    ]);

    const row = await indexer.SafeModule.getOrThrow(`${id}-${moduleAddr}`);
    expect(row.safe_id).toBe(id);
    expect(row.module).toBe(moduleAddr);
    expect(row.chainId).toBe(CHAIN_ID);
    expect(row.enabledAtBlock).toBeGreaterThan(0);
    expect(row.enabledAtTimestamp).toBeGreaterThan(0n);
    expect(row.enabledTxHash.startsWith("0x")).toBe(true);
  });

  it("lowercases the module address before storing", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("mod-lowercase");
    const id = seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr });
    const moduleMixed =
      "0xCaFeBaBeCaFeBaBeCaFeBaBeCaFeBaBeCaFeBaBe" as `0x${string}`;

    await processOnChain(indexer, CHAIN_ID, [
      simulateEnabledModule({ safeAddress: safeAddr, module: moduleMixed }),
    ]);

    const row = await indexer.SafeModule.getOrThrow(
      `${id}-${moduleMixed.toLowerCase()}`,
    );
    expect(row.module).toBe(moduleMixed.toLowerCase());
  });

  it("enabling the same module twice is idempotent (single row, latest enabledAt)", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("mod-double-enable");
    const id = seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr });
    const moduleAddr = addr("mod-dup");

    await processOnChain(indexer, CHAIN_ID, [
      simulateEnabledModule({ safeAddress: safeAddr, module: moduleAddr }),
      simulateEnabledModule({ safeAddress: safeAddr, module: moduleAddr }),
    ]);

    const all = await indexer.SafeModule.getAll();
    const forSafe = all.filter((m) => m.safe_id === id);
    expect(forSafe).toHaveLength(1);
    expect(forSafe[0]?.module).toBe(moduleAddr);
  });

  it("multiple modules on one Safe each get their own row", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("mod-multi");
    const id = seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr });
    const modA = addr("mod-multi-a");
    const modB = addr("mod-multi-b");
    const modC = addr("mod-multi-c");

    await processOnChain(indexer, CHAIN_ID, [
      simulateEnabledModule({ safeAddress: safeAddr, module: modA }),
      simulateEnabledModule({ safeAddress: safeAddr, module: modB }),
      simulateEnabledModule({ safeAddress: safeAddr, module: modC }),
    ]);

    const all = await indexer.SafeModule.getAll();
    const modules = all
      .filter((m) => m.safe_id === id)
      .map((m) => m.module)
      .sort();
    expect(modules).toEqual([modA, modB, modC].sort());
  });
});

describe("DisabledModule (pre-1.4.0, non-indexed)", () => {
  it("is a no-op when the Safe doesn't exist", async () => {
    const indexer = createIndexer();
    await processOnChain(indexer, CHAIN_ID, [
      simulateDisabledModule({
        safeAddress: addr("ghost-disable-safe"),
        module: addr("ghost-disable-mod"),
      }),
    ]);
    expect(await indexer.SafeModule.getAll()).toEqual([]);
  });

  it("is a no-op when the module isn't currently enabled", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("mod-disable-noop");
    seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr });

    await processOnChain(indexer, CHAIN_ID, [
      simulateDisabledModule({
        safeAddress: safeAddr,
        module: addr("never-enabled"),
      }),
    ]);

    expect(await indexer.SafeModule.getAll()).toEqual([]);
  });

  it("removes the SafeModule row that was previously enabled", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("mod-disable-known");
    const id = seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr });
    const moduleAddr = addr("mod-bye");

    await processOnChain(indexer, CHAIN_ID, [
      simulateEnabledModule({ safeAddress: safeAddr, module: moduleAddr }),
      simulateDisabledModule({ safeAddress: safeAddr, module: moduleAddr }),
    ]);

    const row = await indexer.SafeModule.get(`${id}-${moduleAddr}`);
    expect(row).toBeUndefined();
  });

  it("only removes the targeted module — siblings stay enabled", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("mod-disable-one-of-many");
    const id = seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr });
    const keep = addr("mod-keep");
    const drop = addr("mod-drop");

    await processOnChain(indexer, CHAIN_ID, [
      simulateEnabledModule({ safeAddress: safeAddr, module: keep }),
      simulateEnabledModule({ safeAddress: safeAddr, module: drop }),
      simulateDisabledModule({ safeAddress: safeAddr, module: drop }),
    ]);

    const all = await indexer.SafeModule.getAll();
    const modules = all.filter((m) => m.safe_id === id).map((m) => m.module);
    expect(modules).toEqual([keep]);
  });
});

describe("EnabledModuleV4 / DisabledModuleV4 (v1.4.0+, indexed)", () => {
  it("EnabledModuleV4 creates the same SafeModule row shape as the non-indexed variant", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("mod-v4-enable");
    const id = seedSafe(indexer, {
      chainId: CHAIN_ID,
      address: safeAddr,
      version: "V1_4_1",
      masterCopy: MASTER_COPIES.V1_4_1_L2,
    });
    const moduleAddr = addr("mod-v4");

    await processOnChain(indexer, CHAIN_ID, [
      simulateEnabledModule({
        safeAddress: safeAddr,
        module: moduleAddr,
        v4: true,
      }),
    ]);

    const row = await indexer.SafeModule.getOrThrow(`${id}-${moduleAddr}`);
    expect(row.module).toBe(moduleAddr);
    expect(row.safe_id).toBe(id);
  });

  it("DisabledModuleV4 removes a row enabled by either variant", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("mod-v4-cross-disable");
    const id = seedSafe(indexer, {
      chainId: CHAIN_ID,
      address: safeAddr,
      version: "V1_4_1",
    });
    const moduleAddr = addr("mod-cross");

    await processOnChain(indexer, CHAIN_ID, [
      simulateEnabledModule({ safeAddress: safeAddr, module: moduleAddr }), // pre-1.4.0 shape
      simulateDisabledModule({
        safeAddress: safeAddr,
        module: moduleAddr,
        v4: true,
      }),
    ]);

    const row = await indexer.SafeModule.get(`${id}-${moduleAddr}`);
    expect(row).toBeUndefined();
  });
});

describe("Pre-creation delegate-call emissions (Safe 4337 module installer pattern)", () => {
  // SKIPPED-ENVIO-3.2: see creationContext.test.ts.
  it.skip("EnabledModule → SafeSetup → ProxyCreation in one batch yields the canonical Safe + module", async () => {
    // This mirrors the exact production tx layout observed on Gnosis Safe
    // 0xb9881a… (creation tx 0x4ab99adf…): the Safe-4337 module is enabled
    // via a multiSend delegate-call inside setup(), so EnabledModule fires
    // BEFORE SafeSetup, which fires BEFORE the factory's ProxyCreation.
    // Pre-fix this dropped the module silently (the wildcard handler bailed
    // because the Safe entity didn't exist yet at log[0]).
    const indexer = createIndexer();
    const proxy = addr("setup-bundle-safe");
    const owner = addr("setup-bundle-owner");
    const module = addr("setup-bundle-module");

    await processOnChain(indexer, CHAIN_ID, [
      simulateEnabledModule({ safeAddress: proxy, module, v4: true }),
      simulateSafeSetup({ safeAddress: proxy, owners: [owner], threshold: 1n }),
      simulateProxyCreationModern({
        contract: "GnosisSafeProxy1_4_1",
        proxy,
        singleton: MASTER_COPIES.V1_4_1_L2 as `0x${string}`,
      }),
    ]);

    const id = safeId(CHAIN_ID, proxy);
    const safe = await indexer.Safe.getOrThrow(id);
    expect(safe.owners).toEqual([owner]);
    expect(safe.threshold).toBe(1);
    expect(safe.version).toBe("V1_4_1_L2");
    expect(safe.masterCopy).toBe(MASTER_COPIES.V1_4_1_L2);
    const row = await indexer.SafeModule.getOrThrow(`${id}-${module}`);
    expect(row.module).toBe(module);
  });

  // SKIPPED-ENVIO-3.2: see creationContext.test.ts.
  it.skip("two EnabledModule pre-creation + one post-creation: all three modules captured", async () => {
    // The other observed pattern on Gnosis Safe 0xb9881a…: three modules
    // enabled in the creation tx — one inside setup() (pre-ProxyCreation),
    // two after via post-setup execs in the same tx (post-ProxyCreation).
    // Verifies stub → enrich → continue works for all three.
    const indexer = createIndexer();
    const proxy = addr("triple-mod-safe");
    const owner = addr("triple-mod-owner");
    const modA = addr("mod-pre-setup");
    const modB = addr("mod-post-setup-1");
    const modC = addr("mod-post-setup-2");

    await processOnChain(indexer, CHAIN_ID, [
      simulateEnabledModule({ safeAddress: proxy, module: modA, v4: true }),
      simulateSafeSetup({ safeAddress: proxy, owners: [owner], threshold: 1n }),
      simulateProxyCreationModern({
        contract: "GnosisSafeProxy1_4_1",
        proxy,
        singleton: MASTER_COPIES.V1_4_1_L2 as `0x${string}`,
      }),
      simulateEnabledModule({ safeAddress: proxy, module: modB, v4: true }),
      simulateEnabledModule({ safeAddress: proxy, module: modC, v4: true }),
    ]);

    const id = safeId(CHAIN_ID, proxy);
    const all = await indexer.SafeModule.getAll();
    const forSafe = all.filter((m) => m.safe_id === id).map((m) => m.module).sort();
    expect(forSafe).toEqual([modA, modB, modC].sort());
  });
});

describe("Module lifecycle", () => {
  it("enable → disable → re-enable yields a single row with a refreshed enabledAt", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("mod-cycle");
    const id = seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr });
    const moduleAddr = addr("mod-cycle-target");

    // Single indexer.process call — TestIndexer can't be re-run with
    // startBlock=0 once it has advanced. Each builder auto-advances to a fresh
    // block, so the re-enable will land on a strictly later block than the
    // initial enable.
    await processOnChain(indexer, CHAIN_ID, [
      simulateEnabledModule({
        safeAddress: safeAddr,
        module: moduleAddr,
        block: { number: 100 },
      }),
      simulateDisabledModule({
        safeAddress: safeAddr,
        module: moduleAddr,
        block: { number: 200 },
      }),
      simulateEnabledModule({
        safeAddress: safeAddr,
        module: moduleAddr,
        block: { number: 300 },
      }),
    ]);

    const reenabled = await indexer.SafeModule.getOrThrow(
      `${id}-${moduleAddr}`,
    );
    expect(reenabled.enabledAtBlock).toBe(300);

    const forSafe = (await indexer.SafeModule.getAll()).filter(
      (m) => m.safe_id === id,
    );
    expect(forSafe).toHaveLength(1);
  });

  it("module rows are namespaced by chain — same (safe, module) on a different chain is a separate row", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("mod-multichain");
    seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr });
    seedSafe(indexer, { chainId: 100, address: safeAddr });
    const moduleAddr = addr("mod-shared");

    await processOnChain(indexer, CHAIN_ID, [
      simulateEnabledModule({ safeAddress: safeAddr, module: moduleAddr }),
    ]);
    await processOnChain(indexer, 100, [
      simulateEnabledModule({ safeAddress: safeAddr, module: moduleAddr }),
    ]);

    const all = await indexer.SafeModule.getAll();
    const matchingModule = all.filter((m) => m.module === moduleAddr);
    expect(matchingModule).toHaveLength(2);
    expect(matchingModule.map((m) => m.chainId).sort()).toEqual([1, 100]);
  });
});
