import { describe, it, expect } from "vitest";
import { addr, safeId } from "./fixtures/addresses";
import { createIndexer, processOnChain, seedSafe } from "./fixtures/indexer";
import {
  simulateAddedOwner,
  simulateRemovedOwner,
  simulateChangedThreshold,
  simulateSafeSetup,
  resetBlockCounter,
} from "./fixtures/events";
import { expectOwnerMembership } from "./fixtures/assertions";

const CHAIN_ID = 1;

describe("AddedOwner", () => {
  it("auto-stubs the Safe when AddedOwner fires before SafeSetup / ProxyCreation", async () => {
    // Models the setup()-time delegate-call sequence: an inner multiSend
    // emits AddedOwner on the (future) Safe address before SafeSetup or
    // ProxyCreation register it. The wildcard handler creates a stub so the
    // owner isn't dropped; later SafeSetup overwrites the stub's owners with
    // its full owner set if it arrives.
    resetBlockCounter();
    const indexer = createIndexer();
    const safeAddr = addr("ghost");
    const ownerAddr = addr("alice");
    await processOnChain(indexer, CHAIN_ID, [
      simulateAddedOwner({
        contract: "GnosisSafeL2",
        safeAddress: safeAddr,
        owner: ownerAddr,
      }),
    ]);
    const stub = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, safeAddr));
    expect(stub.owners).toEqual([ownerAddr]);
    const owners = await indexer.Owner.getAll();
    expect(owners.map((o) => o.id)).toEqual([ownerAddr]);
  });

  it("appends the owner, mirrors to Owner.safes, and creates the SafeOwner join", async () => {
    resetBlockCounter();
    const indexer = createIndexer();
    const safeAddr = addr("safe-1");
    const aliceAddr = addr("alice");
    const id = seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr });

    await processOnChain(indexer, CHAIN_ID, [
      simulateAddedOwner({ contract: "GnosisSafeL2", safeAddress: safeAddr, owner: aliceAddr }),
    ]);

    const safe = await indexer.Safe.getOrThrow(id);
    expect(safe.owners).toEqual([aliceAddr]);
    await expectOwnerMembership(indexer, { owner: aliceAddr, safeIds: [id] });
  });

  it("SafeSetup then AddedOwner in same batch: second owner is appended", async () => {
    // Reproduces the v1.5.0 deployment pattern surfaced by the cross-reference
    // suite: setup() is called with one owner, then a delegate-call inside the
    // same tx invokes addOwnerWithThreshold(extraOwner). On-chain log order is
    // SafeSetup (initial owner) → AddedOwner (extra owner) — both within the
    // same tx and processed in one batch.
    resetBlockCounter();
    const indexer = createIndexer();
    const proxy = addr("setup-then-add");
    const ownerA = addr("setup-owner");
    const ownerB = addr("delegate-call-owner");

    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeSetup({ safeAddress: proxy, owners: [ownerA], threshold: 1n }),
      simulateAddedOwner({
        contract: "GnosisSafeL2",
        safeAddress: proxy,
        owner: ownerB,
        v4: true,
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, proxy));
    expect([...safe.owners].sort()).toEqual([ownerA, ownerB].sort());
  });

  it("dedups AddedOwner + AddedOwnerV4 fired at the same event (owners array length 1)", async () => {
    resetBlockCounter();
    const indexer = createIndexer();
    const safeAddr = addr("safe-dedup");
    const aliceAddr = addr("alice-dedup");
    const id = seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr });

    // Both event variants fire for the same on-chain event (indexed +
    // non-indexed share topic0). Simulate that by emitting two events in
    // the same block, same logIndex range.
    await processOnChain(indexer, CHAIN_ID, [
      simulateAddedOwner({
        contract: "GnosisSafeL2",
        safeAddress: safeAddr,
        owner: aliceAddr,
      }),
      simulateAddedOwner({
        contract: "GnosisSafeL2",
        safeAddress: safeAddr,
        owner: aliceAddr,
        v4: true,
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(id);
    expect(safe.owners).toEqual([aliceAddr]);
  });
});

describe("RemovedOwner", () => {
  it("is a no-op when the Safe doesn't exist", async () => {
    resetBlockCounter();
    const indexer = createIndexer();
    await processOnChain(indexer, CHAIN_ID, [
      simulateRemovedOwner({
        contract: "GnosisSafeL2",
        safeAddress: addr("ghost-rm"),
        owner: addr("alice-rm"),
      }),
    ]);
    expect(await indexer.Owner.getAll()).toEqual([]);
  });

  it("filters the owner from Safe.owners, mirrors to Owner.safes, deletes the SafeOwner join", async () => {
    resetBlockCounter();
    const indexer = createIndexer();
    const safeAddr = addr("safe-rm");
    const aliceAddr = addr("alice-rm-2");
    const id = seedSafe(indexer, {
      chainId: CHAIN_ID,
      address: safeAddr,
      owners: [aliceAddr],
    });
    // Pre-seed the mirror state too — the handler assumes addOwner has fired
    // for this Safe/Owner pair already.
    (indexer as any).Owner.set({ id: aliceAddr.toLowerCase(), safes: [id] });
    (indexer as any).SafeOwner.set({
      id: `${aliceAddr.toLowerCase()}-${id}`,
      owner_id: aliceAddr.toLowerCase(),
      safe_id: id,
    });

    await processOnChain(indexer, CHAIN_ID, [
      simulateRemovedOwner({ contract: "GnosisSafeL2", safeAddress: safeAddr, owner: aliceAddr }),
    ]);

    const safe = await indexer.Safe.getOrThrow(id);
    expect(safe.owners).toEqual([]);
    const owner = await indexer.Owner.getOrThrow(aliceAddr.toLowerCase());
    expect(owner.safes).toEqual([]);
    expect(await indexer.SafeOwner.get(`${aliceAddr.toLowerCase()}-${id}`)).toBeUndefined();
  });

  it("is an idempotent no-op when the owner isn't in Safe.owners", async () => {
    resetBlockCounter();
    const indexer = createIndexer();
    const safeAddr = addr("safe-rm-noop");
    const id = seedSafe(indexer, {
      chainId: CHAIN_ID,
      address: safeAddr,
      owners: [addr("kept")],
    });

    await processOnChain(indexer, CHAIN_ID, [
      simulateRemovedOwner({
        contract: "GnosisSafeL2",
        safeAddress: safeAddr,
        owner: addr("never-added"),
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(id);
    expect(safe.owners).toEqual([addr("kept")]);
  });

  it("dedups RemovedOwner + RemovedOwnerV4 fired at the same event", async () => {
    resetBlockCounter();
    const indexer = createIndexer();
    const safeAddr = addr("safe-rm-dedup");
    const aliceAddr = addr("alice-rm-dedup");
    seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr, owners: [aliceAddr] });

    await processOnChain(indexer, CHAIN_ID, [
      simulateRemovedOwner({ contract: "GnosisSafeL2", safeAddress: safeAddr, owner: aliceAddr }),
      simulateRemovedOwner({
        contract: "GnosisSafeL2",
        safeAddress: safeAddr,
        owner: aliceAddr,
        v4: true,
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, safeAddr));
    expect(safe.owners).toEqual([]);
  });
});

describe("ChangedThreshold", () => {
  it("is a no-op when the Safe doesn't exist", async () => {
    resetBlockCounter();
    const indexer = createIndexer();
    await processOnChain(indexer, CHAIN_ID, [
      simulateChangedThreshold({ safeAddress: addr("ghost-thr"), threshold: 3n }),
    ]);
    expect(await indexer.Safe.getAll()).toEqual([]);
  });

  it("updates Safe.threshold to a plain number (bigint param coerced)", async () => {
    resetBlockCounter();
    const indexer = createIndexer();
    const safeAddr = addr("safe-thr");
    const id = seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr, threshold: 1 });

    await processOnChain(indexer, CHAIN_ID, [
      simulateChangedThreshold({ safeAddress: safeAddr, threshold: 5n }),
    ]);

    const safe = await indexer.Safe.getOrThrow(id);
    expect(safe.threshold).toBe(5);
  });
});

describe("ChangedThreshold (GnosisSafeL2 wildcard — modern Safes v1.3.0+)", () => {
  it("updates Safe.threshold for a seeded modern Safe", async () => {
    // The bug we fixed: integration test (sample=100) found Safe
    // 0x49239b… on chain 1 with canonical threshold=4 but ours=1, because
    // we didn't subscribe to ChangedThreshold on GnosisSafeL2.
    resetBlockCounter();
    const indexer = createIndexer();
    const safeAddr = addr("modern-safe-thr");
    const id = seedSafe(indexer, {
      chainId: CHAIN_ID,
      address: safeAddr,
      version: "1.4.1",
      threshold: 1,
    });

    await processOnChain(indexer, CHAIN_ID, [
      simulateChangedThreshold({
        safeAddress: safeAddr,
        threshold: 4n,
        contract: "GnosisSafeL2",
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(id);
    expect(safe.threshold).toBe(4);
  });

  it("auto-stubs the Safe when ChangedThreshold fires before SafeSetup / ProxyCreation", async () => {
    // Same pre-setup wildcard semantic as EnabledModule etc.: a multiSend
    // bundle could call changeThreshold inside setup() before SafeSetup is
    // emitted. The wildcard handler must not drop the event.
    resetBlockCounter();
    const indexer = createIndexer();
    const safeAddr = addr("ghost-modern-thr");

    await processOnChain(indexer, CHAIN_ID, [
      simulateChangedThreshold({
        safeAddress: safeAddr,
        threshold: 3n,
        contract: "GnosisSafeL2",
      }),
    ]);

    const stub = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, safeAddr));
    expect(stub.threshold).toBe(3);
    expect(stub.counted).toBe(false); // orphan stub stays uncounted
  });

  it("sequence: SafeSetup → ChangedThreshold → final Safe has the post-mutation threshold", async () => {
    resetBlockCounter();
    const indexer = createIndexer();
    const safeAddr = addr("thr-seq");

    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeSetup({
        safeAddress: safeAddr,
        owners: [addr("thr-seq-a"), addr("thr-seq-b"), addr("thr-seq-c")],
        threshold: 2n,
      }),
      simulateChangedThreshold({
        safeAddress: safeAddr,
        threshold: 3n,
        contract: "GnosisSafeL2",
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(safeId(CHAIN_ID, safeAddr));
    expect(safe.threshold).toBe(3);
    expect(safe.owners).toHaveLength(3);
  });
});
