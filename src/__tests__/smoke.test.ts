import { describe, it, expect } from "vitest";
import { createTestIndexer } from "envio";
import { addr } from "./fixtures/addresses";
import { createIndexer, processOnChain } from "./fixtures/indexer";
import { simulateAddedOwner } from "./fixtures/events";

describe("smoke", () => {
  it("createTestIndexer instantiates and Safe.getAll() is empty", async () => {
    const indexer = createTestIndexer();
    expect(await indexer.Safe.getAll()).toEqual([]);
  });

  it("processes an event against an unknown safe without throwing or mutating state", async () => {
    const indexer = createIndexer();
    await processOnChain(indexer, 1, [
      simulateAddedOwner({
        contract: "GnosisSafeL2",
        safeAddress: addr("ghost-safe"),
        owner: addr("alice"),
      }),
    ]);
    expect(await indexer.Safe.getAll()).toEqual([]);
    expect(await indexer.Owner.getAll()).toEqual([]);
  });
});
