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

  it("a wildcard state event against an unknown safe creates a stub Safe entity", async () => {
    // The setup()-time delegate-call pattern (Safe's 4337 module installer,
    // multiSend payloads, etc.) emits state-mutation events on the Safe
    // address BEFORE the factory's ProxyCreation registers it. The wildcard
    // handlers auto-stub the Safe so the state isn't dropped; a later
    // SafeSetup / ProxyCreation enriches the stub on its existing-safe path.
    const indexer = createIndexer();
    const safeAddr = addr("ghost-safe");
    const ownerAddr = addr("alice");
    await processOnChain(indexer, 1, [
      simulateAddedOwner({
        contract: "GnosisSafeL2",
        safeAddress: safeAddr,
        owner: ownerAddr,
      }),
    ]);
    const safes = await indexer.Safe.getAll();
    expect(safes).toHaveLength(1);
    expect(safes[0]?.address).toBe(safeAddr);
    expect(safes[0]?.owners).toEqual([ownerAddr]);
  });
});
