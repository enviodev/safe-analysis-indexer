import { describe, it, expect } from "vitest";
import { addr, safeId } from "./fixtures/addresses";
import { createIndexer, processOnChain, seedSafe } from "./fixtures/indexer";
import {
  simulateAddedOwner,
  simulateRemovedOwner,
  simulateChangedThreshold,
  resetBlockCounter,
} from "./fixtures/events";
import { expectOwnerMembership } from "./fixtures/assertions";

const CHAIN_ID = 1;

describe("AddedOwner", () => {
  it("is a no-op when the Safe doesn't exist", async () => {
    resetBlockCounter();
    const indexer = createIndexer();
    await processOnChain(indexer, CHAIN_ID, [
      simulateAddedOwner({
        contract: "GnosisSafeL2",
        safeAddress: addr("ghost"),
        owner: addr("alice"),
      }),
    ]);
    expect(await indexer.Owner.getAll()).toEqual([]);
    expect(await indexer.SafeOwner.getAll()).toEqual([]);
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
