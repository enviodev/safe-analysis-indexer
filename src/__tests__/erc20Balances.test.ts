import { describe, it, expect } from "vitest";
import { addr } from "./fixtures/addresses";
import { createIndexer, processOnChain, seedSafe } from "./fixtures/indexer";
import { simulateErc20Transfer, simulateSafeRegistration } from "./fixtures/events";

const CHAIN_ID = 1;

// The production wildcard filter
//   where: ({ chain }) => ({ params: [{ from: chain.SafeErc20Watcher.addresses },
//                                     { to:   chain.SafeErc20Watcher.addresses }] })
// gates these Transfers to ones touching a known Safe. As of envio 3.2.1 the
// TestIndexer applies that filter in-process too, so a Safe must first be
// registered into the watcher pool (via a ProxyCreation event — see
// `simulateSafeRegistration`) before a Transfer touching it reaches the
// handler. `seedSafe` only writes the Safe entity, not the pool, so the
// seeded-Safe tests below prepend a registration item.

describe("SafeErc20Watcher.Transfer", () => {
  it("a Transfer where neither side is a registered Safe is filtered out (no rows)", async () => {
    // Pre-3.2.1 the simulate path bypassed the address-pool filter, so this
    // event reached the handler and wrote an ERC20Transfer log. 3.2.1 enforces
    // the filter in-process: with neither from nor to in the watcher pool the
    // event is dropped before the handler runs — no ERC20Transfer, no balance.
    const indexer = createIndexer();
    await processOnChain(indexer, CHAIN_ID, [
      simulateErc20Transfer({
        token: addr("token"),
        from: addr("not-a-safe-from"),
        to: addr("not-a-safe-to"),
        value: 100n,
      }),
    ]);

    expect(await indexer.ERC20Transfer.getAll()).toEqual([]);
    expect(await indexer.SafeTokenBalance.getAll()).toEqual([]);
  });

  it("from-side Safe: outbound balance delta, outboundCount=1, inboundCount=0", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("erc20-from-safe");
    seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr });

    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeRegistration(safeAddr),
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
      simulateSafeRegistration(safeAddr),
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
      simulateSafeRegistration(safeA),
      simulateSafeRegistration(safeB),
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
      simulateSafeRegistration(safeAddr),
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

  it("self-transfer (from === to) leaves the balance unchanged (no race on the same row id)", async () => {
    // Self-transfers on ERC20 are legal and not uncommon — some token
    // contracts emit zero-value or no-op transfers as accounting markers
    // (re-approval flows, dust collectors, certain flashloan repays). The
    // handler must not race the parallel out+in updates on the same row id.
    const indexer = createIndexer();
    const safeAddr = addr("erc20-self-xfer");
    const token = addr("token");
    seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr });

    // Seed a real balance first via a normal inbound, then issue a self-transfer.
    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeRegistration(safeAddr),
      simulateErc20Transfer({ token, from: addr("ext"), to: safeAddr, value: 100n }),
      simulateErc20Transfer({ token, from: safeAddr, to: safeAddr, value: 50n }),
    ]);

    const bal = await indexer.SafeTokenBalance.getOrThrow(
      `${CHAIN_ID}-${safeAddr.toLowerCase()}-${token}`,
    );
    // Balance unchanged by the self-transfer (net delta is 0). inbound/outbound
    // counters are NOT bumped for self-transfers — the immutable ERC20Transfer
    // log captures the event, the balance view stays meaningful.
    expect(bal.balance).toBe(100n);
    expect(bal.inboundCount).toBe(1);
    expect(bal.outboundCount).toBe(0);
    // Both transfers are still in the immutable log.
    expect((await indexer.ERC20Transfer.getAll()).length).toBe(2);
  });

  it("stores lowercase token/from/to even if simulate provides checksummed addresses", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("erc20-casing");
    seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr });

    // Manually craft a mixed-case 20-byte address — addr() always returns
    // lowercase, so we synthesize one here by uppercasing some chars.
    const tokenMixed = "0xAaBbCcDdEeFf0011223344556677889900aAbBcC" as `0x${string}`;
    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeRegistration(safeAddr),
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
