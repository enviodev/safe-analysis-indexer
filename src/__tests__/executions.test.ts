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
  simulateExecutionFailure,
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
        block: { number: 4242 },
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
    // blockNumber is the execution block, set at row creation.
    expect(tx.blockNumber).toBe(4242);

    await expectTxCount(indexer, {
      global: 1,
      chainId: CHAIN_ID,
      network: 1,
      version: "1.3.0",
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
        block: { number: 1337 },
      }),
    ]);

    const rows = await indexer.SafeModuleTransaction.getAll();
    expect(rows.length).toBe(1);
    expect(rows[0]!.safeModule.toLowerCase()).toBe(addr("the-module"));
    expect(rows[0]!.value).toBe(42n);
    expect(rows[0]!.blockNumber).toBe(1337);

    await expectModuleTxCount(indexer, {
      global: 1,
      chainId: CHAIN_ID,
      network: 1,
      version: "1.3.0",
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

  // The dual-fire dedup bug previously blocked these tests:
  //
  // envio's TestIndexer fires GnosisSafeL2 ExecutionSuccess (and V4) twice
  // per event — once for preload, once for execution. The module-scope
  // `processedExecutions` Set used to accumulate keys during preload and
  // bail the execution pass, so writes never committed. Diagnosed and fixed
  // in the same PR as these tests being restored — `executionDedup` now
  // returns false during `context.isPreload`, so dedup only fires during
  // the real execution pass. The bug was also live in production (Safes
  // had SafeTransaction rows with safeTxHash=null), surfaced by the
  // cross-reference integration suite.

  it("ExecutionSuccess with a prior SafeTransaction sets success=true and updates Safe counters", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("exec-success-safe");
    const id = seedSafe(indexer, {
      chainId: CHAIN_ID,
      address: safeAddr,
      version: "1.4.1",
    });
    const safeTxHash = ("0x" + "ab".repeat(32)) as `0x${string}`;

    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeMultiSigTransaction({
        safeAddress: safeAddr,
        nonce: 0n,
        msgSender: addr("sender"),
        threshold: 1n,
      }),
      simulateExecutionSuccess({
        safeAddress: safeAddr,
        txHash: safeTxHash,
        payment: 100n,
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(id);
    expect(safe.numberOfSuccessfulExecutions).toBe(1);
    expect(safe.nonce).toBe(1n);
    expect(safe.totalGasSpent).toBe(100n);

    const tx = await indexer.SafeTransaction.getOrThrow(`${id}-0`);
    expect(tx.success).toBe(true);
    expect(tx.safeTxHash).toBe(safeTxHash);
  });

  it("ExecutionFailure with a prior SafeTransaction sets success=false and updates Safe counters", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("exec-failure-safe");
    const id = seedSafe(indexer, {
      chainId: CHAIN_ID,
      address: safeAddr,
      version: "1.4.1",
    });
    const safeTxHash = ("0x" + "cd".repeat(32)) as `0x${string}`;

    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeMultiSigTransaction({
        safeAddress: safeAddr,
        nonce: 0n,
        msgSender: addr("fail-sender"),
        threshold: 1n,
      }),
      simulateExecutionFailure({
        safeAddress: safeAddr,
        txHash: safeTxHash,
        payment: 50n,
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(id);
    expect(safe.numberOfFailedExecutions).toBe(1);
    expect(safe.numberOfSuccessfulExecutions).toBe(0);
    expect(safe.nonce).toBe(1n);
    expect(safe.totalGasSpent).toBe(50n);

    const tx = await indexer.SafeTransaction.getOrThrow(`${id}-0`);
    expect(tx.success).toBe(false);
    expect(tx.safeTxHash).toBe(safeTxHash);
  });

  it("ExecutionSuccess + ExecutionSuccessV4 same event: dedup keeps counters at +1, not +2", async () => {
    // V4 and non-V4 share the same topic0 — both handlers fire on a single
    // on-chain emission. The dedup ensures we don't double-count. This is
    // the test that specifically validates the dedup semantic (regression
    // for the production bug fixed by gating dedup on `!context.isPreload`).
    const indexer = createIndexer();
    const safeAddr = addr("exec-dedup-safe");
    const id = seedSafe(indexer, {
      chainId: CHAIN_ID,
      address: safeAddr,
      version: "1.4.1",
    });
    const safeTxHash = ("0x" + "ef".repeat(32)) as `0x${string}`;
    // Force both V4 and non-V4 simulators to emit at the same (block, logIndex)
    // so they collide on the dedup key — that's what an actual on-chain event
    // looks like to envio (same topic0, two matching handler registrations).
    const collisionBlock = { number: 9_001 };
    const collisionLogIndex = 0;

    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeMultiSigTransaction({
        safeAddress: safeAddr,
        nonce: 0n,
        msgSender: addr("dedup-sender"),
        threshold: 1n,
      }),
      simulateExecutionSuccess({
        safeAddress: safeAddr,
        txHash: safeTxHash,
        payment: 10n,
        block: collisionBlock,
        logIndex: collisionLogIndex,
      }),
      simulateExecutionSuccess({
        safeAddress: safeAddr,
        txHash: safeTxHash,
        payment: 10n,
        block: collisionBlock,
        logIndex: collisionLogIndex,
        v4: true,
      }),
    ]);

    const safe = await indexer.Safe.getOrThrow(id);
    // Exactly +1 — not +2. This is the load-bearing assertion.
    expect(safe.numberOfSuccessfulExecutions).toBe(1);
    expect(safe.nonce).toBe(1n);
    expect(safe.totalGasSpent).toBe(10n);
  });

  it.todo("ExecutionSuccess on a non-L1 safe with no prior multisig tx is a silent skip");
  it.todo("ExecutionSuccess L1 path: decodes execTransaction from event.transaction.input directly");
  it.todo("ExecutionSuccess L1 path: falls back to getExecTransactionViaRpcTrace when tx.input isn't decodable");
  it.todo("Sequence multisig→success→multisig→failure: nonce, gas, success flags");
});

describe("safeTxHash linking (Section 3.6)", () => {
  // The L2 path (SafeMultiSigTransaction → ExecutionSuccess/Failure
  // → safeTxHash set on the row) is covered by the two tests above in
  // "ExecutionSuccess / ExecutionFailure". The L1 trace-path test below
  // stays a todo because it needs createL1SafeTransaction fixture wiring
  // (effect mocks for getExecTransactionViaRpcTrace + tx.input decoding).
  it.todo("L1 path createL1SafeTransaction stores safeTxHash from the event");
});
