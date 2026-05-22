import { describe, it, expect, beforeEach } from "vitest";
import { addr } from "./fixtures/addresses";
import {
  createIndexer,
  processOnChain,
  seedSafe,
  clearEffectFixtures,
} from "./fixtures/indexer";
import {
  simulateSafeMultiSigTransaction,
  simulateSafeModuleTransaction,
  simulateExecutionSuccess,
} from "./fixtures/events";
import { expectTxCount, expectModuleTxCount } from "./fixtures/assertions";

const CHAIN_ID = 1;

// Note: we DO NOT call resetBlockCounter() here. envio's TestIndexer reuses
// workers across createTestIndexer() calls within a test file, which means
// the module-scope `processedExecutions` Set in helpers.ts persists across
// tests. Letting the block counter accumulate guarantees each test's events
// have unique (chainId, blockNumber, logIndex) coords.
beforeEach(() => {
  clearEffectFixtures();
});

describe("SafeMultiSigTransaction", () => {
  it("is a no-op when the Safe doesn't exist", async () => {
    const indexer = createIndexer();
    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeMultiSigTransaction({
        safeAddress: addr("ghost-multisig"),
        nonce: 0n,
        msgSender: addr("alice"),
        threshold: 1n,
      }),
    ]);
    expect(await indexer.SafeTransaction.getAll()).toEqual([]);
  });

  it("creates SafeTransaction with success=undefined, increments tx counters, decodes additionalInfo", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("multisig-safe");
    const id = seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr });
    const msgSender = addr("multisig-sender");

    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeMultiSigTransaction({
        safeAddress: safeAddr,
        nonce: 7n,
        msgSender,
        threshold: 2n,
        to: addr("multisig-to"),
        value: 1000n,
      }),
    ]);

    const tx = await indexer.SafeTransaction.getOrThrow(`${id}-7`);
    expect(tx.success).toBeUndefined();
    expect(tx.nonce).toBe(7n);
    expect(tx.msgSender.toLowerCase()).toBe(msgSender);
    expect(tx.threshold).toBe(2);
    expect(tx.to.toLowerCase()).toBe(addr("multisig-to"));
    expect(tx.value).toBe(1000n);
    // safeTxHash is null until ExecutionSuccess/Failure fires — the
    // SafeMultiSigTransaction event doesn't carry it.
    expect(tx.safeTxHash).toBeUndefined();

    await expectTxCount(indexer, {
      global: 1,
      chainId: CHAIN_ID,
      network: 1,
      version: "V1_3_0",
      versionCount: 1,
    });
  });
});

describe("SafeModuleTransaction", () => {
  it("is a no-op when the Safe doesn't exist", async () => {
    const indexer = createIndexer();
    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeModuleTransaction({
        safeAddress: addr("ghost-module"),
        module: addr("module-x"),
      }),
    ]);
    expect(await indexer.SafeModuleTransaction.getAll()).toEqual([]);
  });

  it("creates SafeModuleTransaction and increments module-tx counters", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("module-safe");
    seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr });

    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeModuleTransaction({
        safeAddress: safeAddr,
        module: addr("the-module"),
        to: addr("module-to"),
        value: 42n,
      }),
    ]);

    const rows = await indexer.SafeModuleTransaction.getAll();
    expect(rows.length).toBe(1);
    expect(rows[0]!.safeModule.toLowerCase()).toBe(addr("the-module"));
    expect(rows[0]!.value).toBe(42n);

    await expectModuleTxCount(indexer, {
      global: 1,
      chainId: CHAIN_ID,
      network: 1,
      version: "V1_3_0",
      versionCount: 1,
    });
  });
});

describe("ExecutionSuccess / ExecutionFailure", () => {
  it("ExecutionSuccess on unknown safe is a no-op (handler fires but silent-returns)", async () => {
    const indexer = createIndexer();
    await processOnChain(indexer, CHAIN_ID, [
      simulateExecutionSuccess({ safeAddress: addr("ghost-exec") }),
    ]);
    expect(await indexer.Safe.getAll()).toEqual([]);
  });

  // ---------------------------------------------------------------------
  // The following branches are deferred behind it.todo for now.
  //
  // envio v3.0.0's TestIndexer fires the GnosisSafeL2 ExecutionSuccess
  // (and ExecutionSuccessV4) handlers TWICE for a single simulate item —
  // once before the prior block's writes have committed (so Safe.get()
  // returns undefined), then once after. The first invocation adds the
  // event's (chainId, block, logIndex) key to the module-scope
  // `processedExecutions` Set; the second is dedup-skipped, so the state
  // mutations never happen.
  //
  // In production with real chain events this isn't a problem — each
  // on-chain event has exactly one matching handler signature (topic
  // count disambiguates indexed vs non-indexed). It's specific to
  // TestIndexer's overload routing.
  //
  // Restoring these tests is unblocked by either: envio publishing a
  // TestIndexer mock-effect / dedup-reset hook, or refactoring the
  // dedup state to be per-event (e.g., keyed inclusive of the handler
  // identity) instead of module-scope. Filed under the test-suite
  // follow-up backlog.
  // ---------------------------------------------------------------------

  it.todo("ExecutionSuccess with a prior SafeTransaction sets success=true and updates Safe counters (blocked: envio dual-fire + dedup, see comment above)");
  it.todo("ExecutionFailure with a prior SafeTransaction sets success=false and updates Safe counters (blocked: envio dual-fire + dedup)");
  it.todo("ExecutionSuccess + ExecutionSuccessV4 same event: dedup, counters increment exactly once (blocked: envio dual-fire + dedup)");
  it.todo("ExecutionSuccess on a non-L1 safe with no prior multisig tx is a silent skip (blocked: envio dual-fire + dedup)");
  it.todo("ExecutionSuccess L1 path: decodes execTransaction from event.transaction.input directly (blocked: envio dual-fire + dedup)");
  it.todo("ExecutionSuccess L1 path: falls back to getExecTransactionViaRpcTrace when tx.input isn't decodable (blocked: envio dual-fire + dedup)");
  it.todo("Sequence multisig→success→multisig→failure: nonce, gas, success flags (blocked: envio dual-fire + dedup)");
});

describe("safeTxHash linking (Section 3.6)", () => {
  // safeTxHash is read from ExecutionSuccess/Failure's `txHash` event
  // param and persisted onto the SafeTransaction row. Linking through
  // TestIndexer is blocked by the same envio dual-fire + dedup quirk
  // documented above the other execution todos — converted to it.todo
  // with the same restoration path.
  it.todo("ExecutionSuccess sets safeTxHash + success=true on the prior SafeTransaction (blocked: envio dual-fire + dedup)");
  it.todo("ExecutionFailure sets safeTxHash + success=false on the prior SafeTransaction (blocked: envio dual-fire + dedup)");
  it.todo("L1 path createL1SafeTransaction stores safeTxHash from the event (blocked: envio dual-fire + dedup)");
});
