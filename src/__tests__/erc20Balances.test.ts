import { describe, it, expect } from "vitest";
import { addr } from "./fixtures/addresses";
import { createIndexer, processOnChain, seedSafe } from "./fixtures/indexer";
import { simulateErc20Transfer } from "./fixtures/events";

const CHAIN_ID = 1;

// IMPORTANT — the production wildcard filter
//   where: ({ chain }) => ({ params: [{ from: chain.SafeErc20Watcher.addresses },
//                                     { to:   chain.SafeErc20Watcher.addresses }] })
// runs at HyperSync source, NOT inside the handler. envio's TestIndexer
// simulate path bypasses that filter — every simulate item reaches the
// handler. So tests CANNOT exercise the address-pool gating behaviour
// (covered only by integration / production indexing). What we CAN test
// is the handler's own per-event behaviour (applyBalanceDelta + the
// ERC20Transfer write).

describe("SafeErc20Watcher.Transfer", () => {
  it("writes an ERC20Transfer row but no SafeTokenBalance when neither side is a Safe", async () => {
    const indexer = createIndexer();
    await processOnChain(indexer, CHAIN_ID, [
      simulateErc20Transfer({
        token: addr("token"),
        from: addr("not-a-safe-from"),
        to: addr("not-a-safe-to"),
        value: 100n,
      }),
    ]);

    const transfers = await indexer.ERC20Transfer.getAll();
    expect(transfers.length).toBe(1);
    expect(await indexer.SafeTokenBalance.getAll()).toEqual([]);
  });

  it("from-side Safe: outbound balance delta, outboundCount=1, inboundCount=0", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("erc20-from-safe");
    seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr });

    await processOnChain(indexer, CHAIN_ID, [
      simulateErc20Transfer({
        token: addr("token"),
        from: safeAddr,
        to: addr("external"),
        value: 100n,
      }),
    ]);

    const bal = await indexer.SafeTokenBalance.getOrThrow(
      `${CHAIN_ID}-${safeAddr.toLowerCase()}-${addr("token")}`,
    );
    expect(bal.balance).toBe(-100n);
    expect(bal.outboundCount).toBe(1);
    expect(bal.inboundCount).toBe(0);
  });

  it("to-side Safe: inbound balance delta, inboundCount=1, outboundCount=0", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("erc20-to-safe");
    seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr });

    await processOnChain(indexer, CHAIN_ID, [
      simulateErc20Transfer({
        token: addr("token"),
        from: addr("external"),
        to: safeAddr,
        value: 250n,
      }),
    ]);

    const bal = await indexer.SafeTokenBalance.getOrThrow(
      `${CHAIN_ID}-${safeAddr.toLowerCase()}-${addr("token")}`,
    );
    expect(bal.balance).toBe(250n);
    expect(bal.inboundCount).toBe(1);
    expect(bal.outboundCount).toBe(0);
  });

  it("transfer between two known Safes writes two SafeTokenBalance rows", async () => {
    const indexer = createIndexer();
    const safeA = addr("erc20-safe-a");
    const safeB = addr("erc20-safe-b");
    seedSafe(indexer, { chainId: CHAIN_ID, address: safeA });
    seedSafe(indexer, { chainId: CHAIN_ID, address: safeB });

    await processOnChain(indexer, CHAIN_ID, [
      simulateErc20Transfer({
        token: addr("token"),
        from: safeA,
        to: safeB,
        value: 500n,
      }),
    ]);

    const balA = await indexer.SafeTokenBalance.getOrThrow(
      `${CHAIN_ID}-${safeA.toLowerCase()}-${addr("token")}`,
    );
    const balB = await indexer.SafeTokenBalance.getOrThrow(
      `${CHAIN_ID}-${safeB.toLowerCase()}-${addr("token")}`,
    );
    expect(balA.balance).toBe(-500n);
    expect(balA.outboundCount).toBe(1);
    expect(balB.balance).toBe(500n);
    expect(balB.inboundCount).toBe(1);
  });

  it("accumulates across multiple transfers on the same (safe, token)", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("erc20-accumulate");
    const token = addr("token");
    seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr });

    // 3 inbound + 1 outbound → balance = +200+100+50-30 = 320, counts 3/1
    await processOnChain(indexer, CHAIN_ID, [
      simulateErc20Transfer({ token, from: addr("ext-1"), to: safeAddr, value: 200n }),
      simulateErc20Transfer({ token, from: addr("ext-2"), to: safeAddr, value: 100n }),
      simulateErc20Transfer({ token, from: addr("ext-3"), to: safeAddr, value: 50n }),
      simulateErc20Transfer({ token, from: safeAddr, to: addr("ext-4"), value: 30n }),
    ]);

    const bal = await indexer.SafeTokenBalance.getOrThrow(
      `${CHAIN_ID}-${safeAddr.toLowerCase()}-${token}`,
    );
    expect(bal.balance).toBe(320n);
    expect(bal.inboundCount).toBe(3);
    expect(bal.outboundCount).toBe(1);
  });

  it("stores lowercase token/from/to even if simulate provides checksummed addresses", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("erc20-casing");
    seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr });

    // Manually craft a mixed-case 20-byte address — addr() always returns
    // lowercase, so we synthesize one here by uppercasing some chars.
    const tokenMixed = "0xAaBbCcDdEeFf0011223344556677889900aAbBcC" as `0x${string}`;
    await processOnChain(indexer, CHAIN_ID, [
      simulateErc20Transfer({
        token: tokenMixed,
        from: addr("from"),
        to: safeAddr,
        value: 1n,
      }),
    ]);

    const transfers = await indexer.ERC20Transfer.getAll();
    expect(transfers.length).toBe(1);
    expect(transfers[0]!.token).toBe(tokenMixed.toLowerCase());
    expect(transfers[0]!.from).toBe(transfers[0]!.from.toLowerCase());
    expect(transfers[0]!.to).toBe(transfers[0]!.to.toLowerCase());
  });
});
