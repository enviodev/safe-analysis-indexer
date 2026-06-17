import { describe, it, expect } from "vitest";
import type { EvmOnEventContext } from "envio";
import {
  getOrCreateGlobalStats,
  getOrCreateNetwork,
  getOrCreateVersion,
  incrementSafeCount,
  incrementTransactionCount,
  incrementModuleTransactionCount,
  addSafeToOwner,
  removeSafeFromOwner,
} from "../helpers";

// Minimal in-memory context stub matching the surface helpers.ts uses
// (just .get / .set / .deleteUnsafe on each entity namespace).
function makeStubContext() {
  const stores: Record<string, Map<string, any>> = {};
  function namespace(name: string) {
    if (!stores[name]) stores[name] = new Map();
    const store = stores[name]!;
    return {
      get: async (id: string) => store.get(id),
      set: (entity: any) => store.set(entity.id, entity),
      deleteUnsafe: (id: string) => store.delete(id),
    };
  }
  return {
    GlobalStats: namespace("GlobalStats"),
    Network: namespace("Network"),
    Version: namespace("Version"),
    Owner: namespace("Owner"),
    SafeOwner: namespace("SafeOwner"),
    Safe: namespace("Safe"),
    _stores: stores,
  };
}

// The stub exposes only the entity namespaces the counter helpers touch; cast
// to the full handler context type when passing it across the typed boundary.
// Reads in assertions go through the loosely-typed stub directly.
const asCtx = (c: ReturnType<typeof makeStubContext>) => c as unknown as EvmOnEventContext;

describe("getOrCreate helpers", () => {
  it("getOrCreateGlobalStats returns a zero-counter entity when absent", async () => {
    const ctx = makeStubContext();
    const stats = await getOrCreateGlobalStats(asCtx(ctx));
    expect(stats).toEqual({
      id: "global",
      totalSafes: 0,
      totalTransactions: 0,
      totalModuleTransactions: 0,
    });
  });

  it("getOrCreateNetwork creates with id = chainId.toString()", async () => {
    const ctx = makeStubContext();
    const network = await getOrCreateNetwork(137, asCtx(ctx));
    expect(network.id).toBe("137");
    expect(network.numberOfSafes).toBe(0);
    expect(network.numberOfTransactions).toBe(0);
    expect(network.numberOfModuleTransactions).toBe(0);
  });

  it("getOrCreateVersion creates with id = version string", async () => {
    const ctx = makeStubContext();
    const v = await getOrCreateVersion("V1_3_0", asCtx(ctx));
    expect(v.id).toBe("V1_3_0");
    expect(v.numberOfSafes).toBe(0);
  });

  it("getOrCreateGlobalStats returns the existing entity if present", async () => {
    const ctx = makeStubContext();
    ctx.GlobalStats.set({ id: "global", totalSafes: 7, totalTransactions: 3, totalModuleTransactions: 1 });
    const stats = await getOrCreateGlobalStats(asCtx(ctx));
    expect(stats.totalSafes).toBe(7);
    expect(stats.totalTransactions).toBe(3);
  });
});

describe("incrementSafeCount", () => {
  it("touches GlobalStats + Network + Version on a fresh context", async () => {
    const ctx = makeStubContext();
    await incrementSafeCount(1, "V1_3_0", asCtx(ctx));

    expect((await ctx.GlobalStats.get("global")).totalSafes).toBe(1);
    expect((await ctx.Network.get("1")).numberOfSafes).toBe(1);
    expect((await ctx.Version.get("V1_3_0")).numberOfSafes).toBe(1);
  });

  it("accumulates without double-creating on repeated increments", async () => {
    const ctx = makeStubContext();
    await incrementSafeCount(1, "V1_3_0", asCtx(ctx));
    await incrementSafeCount(1, "V1_3_0", asCtx(ctx));
    await incrementSafeCount(1, "V1_3_0", asCtx(ctx));

    expect((await ctx.GlobalStats.get("global")).totalSafes).toBe(3);
    expect((await ctx.Network.get("1")).numberOfSafes).toBe(3);
    expect((await ctx.Version.get("V1_3_0")).numberOfSafes).toBe(3);
  });

  it("separates per-network and per-version buckets", async () => {
    const ctx = makeStubContext();
    await incrementSafeCount(1, "V1_3_0", asCtx(ctx));
    await incrementSafeCount(137, "V1_4_1", asCtx(ctx));

    expect((await ctx.GlobalStats.get("global")).totalSafes).toBe(2);
    expect((await ctx.Network.get("1")).numberOfSafes).toBe(1);
    expect((await ctx.Network.get("137")).numberOfSafes).toBe(1);
    expect((await ctx.Version.get("V1_3_0")).numberOfSafes).toBe(1);
    expect((await ctx.Version.get("V1_4_1")).numberOfSafes).toBe(1);
  });
});

describe("incrementTransactionCount", () => {
  it("touches all three levels", async () => {
    const ctx = makeStubContext();
    await incrementTransactionCount(1, "V1_3_0", asCtx(ctx));
    expect((await ctx.GlobalStats.get("global")).totalTransactions).toBe(1);
    expect((await ctx.Network.get("1")).numberOfTransactions).toBe(1);
    expect((await ctx.Version.get("V1_3_0")).numberOfTransactions).toBe(1);
  });

  it("does NOT increment Safe counts", async () => {
    const ctx = makeStubContext();
    await incrementTransactionCount(1, "V1_3_0", asCtx(ctx));
    expect((await ctx.GlobalStats.get("global")).totalSafes).toBe(0);
    expect((await ctx.Network.get("1")).numberOfSafes).toBe(0);
    expect((await ctx.Version.get("V1_3_0")).numberOfSafes).toBe(0);
  });
});

describe("incrementModuleTransactionCount", () => {
  it("touches all three levels", async () => {
    const ctx = makeStubContext();
    await incrementModuleTransactionCount(1, "V1_3_0", asCtx(ctx));
    expect((await ctx.GlobalStats.get("global")).totalModuleTransactions).toBe(1);
    expect((await ctx.Network.get("1")).numberOfModuleTransactions).toBe(1);
    expect((await ctx.Version.get("V1_3_0")).numberOfModuleTransactions).toBe(1);
  });
});

describe("addSafeToOwner / removeSafeFromOwner", () => {
  it("creates Owner with safes=[safeId] on first add", async () => {
    const ctx = makeStubContext();
    await addSafeToOwner("0xalice", "1-0xsafe", asCtx(ctx));
    expect((await ctx.Owner.get("0xalice")).safes).toEqual(["1-0xsafe"]);
    expect(await ctx.SafeOwner.get("0xalice-1-0xsafe")).toBeDefined();
  });

  it("extends Owner.safes on subsequent adds for different safeIds", async () => {
    const ctx = makeStubContext();
    await addSafeToOwner("0xalice", "1-0xsafe1", asCtx(ctx));
    await addSafeToOwner("0xalice", "1-0xsafe2", asCtx(ctx));
    expect((await ctx.Owner.get("0xalice")).safes).toEqual(["1-0xsafe1", "1-0xsafe2"]);
  });

  it("does not duplicate safeId in Owner.safes (uses includes check)", async () => {
    const ctx = makeStubContext();
    await addSafeToOwner("0xalice", "1-0xsafe", asCtx(ctx));
    await addSafeToOwner("0xalice", "1-0xsafe", asCtx(ctx));
    expect((await ctx.Owner.get("0xalice")).safes).toEqual(["1-0xsafe"]);
  });

  it("removeSafeFromOwner filters Owner.safes and deletes the SafeOwner join", async () => {
    const ctx = makeStubContext();
    await addSafeToOwner("0xalice", "1-0xsafe", asCtx(ctx));
    await removeSafeFromOwner("0xalice", "1-0xsafe", asCtx(ctx));
    expect((await ctx.Owner.get("0xalice")).safes).toEqual([]);
    expect(await ctx.SafeOwner.get("0xalice-1-0xsafe")).toBeUndefined();
  });

  it("removeSafeFromOwner on a non-existent owner is a no-op (no Owner created)", async () => {
    const ctx = makeStubContext();
    await removeSafeFromOwner("0xghost", "1-0xsafe", asCtx(ctx));
    expect(await ctx.Owner.get("0xghost")).toBeUndefined();
  });
});
