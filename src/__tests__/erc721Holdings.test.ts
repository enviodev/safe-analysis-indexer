import { describe, it, expect } from "vitest";
import { addr } from "./fixtures/addresses";
import { createIndexer, processOnChain, seedSafe } from "./fixtures/indexer";
import { simulateErc721Transfer, simulateSafeRegistration } from "./fixtures/events";

const CHAIN_ID = 1;

// Same address-pool gating as the ERC20 watcher tests: the production `where`
// filter on chain.SafeErc721Watcher.addresses now runs in-process under envio
// 3.2.1, so a Safe must be registered into the pool (via a ProxyCreation event
// — see `simulateSafeRegistration`) before a Transfer touching it reaches the
// handler. `seedSafe` only writes the Safe entity, so the seeded-Safe tests
// prepend a registration item.

describe("SafeErc721Watcher.Transfer", () => {
  it("a Transfer where neither side is a registered Safe is filtered out (no rows)", async () => {
    // Pre-3.2.1 the simulate path bypassed the address-pool filter, so this
    // event reached the handler and wrote an ERC721Transfer log. 3.2.1 enforces
    // the filter in-process: with neither endpoint in the watcher pool the
    // event is dropped before the handler — no ERC721Transfer, no holding.
    const indexer = createIndexer();
    await processOnChain(indexer, CHAIN_ID, [
      simulateErc721Transfer({
        token: addr("nft"),
        from: addr("not-a-safe-from"),
        to: addr("not-a-safe-to"),
        tokenId: 1n,
      }),
    ]);
    expect(await indexer.ERC721Transfer.getAll()).toEqual([]);
    expect(await indexer.SafeNftHolding.getAll()).toEqual([]);
  });

  it("inbound to a Safe creates SafeNftHolding with the acquire context", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("erc721-recv-safe");
    seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr });

    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeRegistration(safeAddr),
      simulateErc721Transfer({
        token: addr("nft"),
        from: addr("external"),
        to: safeAddr,
        tokenId: 42n,
      }),
    ]);

    const id = `${CHAIN_ID}-${safeAddr.toLowerCase()}-${addr("nft").toLowerCase()}-42`;
    const holding = await indexer.SafeNftHolding.getOrThrow(id);
    expect(holding.token).toBe(addr("nft").toLowerCase());
    expect(holding.tokenId).toBe(42n);
    expect(holding.acquiredAtBlock).toBeGreaterThan(0);
  });

  it("outbound from a Safe deletes the SafeNftHolding row", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("erc721-send-safe");
    seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr });

    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeRegistration(safeAddr),
      simulateErc721Transfer({
        token: addr("nft"),
        from: addr("external"),
        to: safeAddr,
        tokenId: 7n,
      }),
      simulateErc721Transfer({
        token: addr("nft"),
        from: safeAddr,
        to: addr("buyer"),
        tokenId: 7n,
      }),
    ]);

    expect(await indexer.SafeNftHolding.getAll()).toEqual([]);
    // Both Transfer rows still recorded (immutable log).
    expect((await indexer.ERC721Transfer.getAll()).length).toBe(2);
  });

  it("re-acquiring a previously-held NFT recreates the holding (acquired-context reflects latest inbound)", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("erc721-reacquire-safe");
    seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr });

    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeRegistration(safeAddr),
      simulateErc721Transfer({
        token: addr("nft"),
        from: addr("external"),
        to: safeAddr,
        tokenId: 1n,
      }),
      simulateErc721Transfer({
        token: addr("nft"),
        from: safeAddr,
        to: addr("buyer"),
        tokenId: 1n,
      }),
      simulateErc721Transfer({
        token: addr("nft"),
        from: addr("buyer"),
        to: safeAddr,
        tokenId: 1n,
      }),
    ]);

    const id = `${CHAIN_ID}-${safeAddr.toLowerCase()}-${addr("nft").toLowerCase()}-1`;
    const holding = await indexer.SafeNftHolding.getOrThrow(id);
    // Three ERC721Transfer rows are recorded immutably — the SafeNftHolding
    // row only reflects "currently held since the most recent acquire".
    expect((await indexer.ERC721Transfer.getAll()).length).toBe(3);
    expect(holding.tokenId).toBe(1n);
  });

  it("Safe-to-Safe transfer: deletes from sender, creates on recipient", async () => {
    const indexer = createIndexer();
    const safeA = addr("erc721-safe-a");
    const safeB = addr("erc721-safe-b");
    seedSafe(indexer, { chainId: CHAIN_ID, address: safeA });
    seedSafe(indexer, { chainId: CHAIN_ID, address: safeB });

    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeRegistration(safeA),
      simulateSafeRegistration(safeB),
      simulateErc721Transfer({
        token: addr("nft"),
        from: addr("external"),
        to: safeA,
        tokenId: 99n,
      }),
      simulateErc721Transfer({
        token: addr("nft"),
        from: safeA,
        to: safeB,
        tokenId: 99n,
      }),
    ]);

    const idA = `${CHAIN_ID}-${safeA.toLowerCase()}-${addr("nft").toLowerCase()}-99`;
    const idB = `${CHAIN_ID}-${safeB.toLowerCase()}-${addr("nft").toLowerCase()}-99`;
    expect(await indexer.SafeNftHolding.get(idA)).toBeUndefined();
    const holdingB = await indexer.SafeNftHolding.getOrThrow(idB);
    expect(holdingB.tokenId).toBe(99n);
    expect(holdingB.safeAddress).toBe(safeB.toLowerCase());
  });

  it("self-transfer (from === to) leaves the holding unchanged (no race on the same row id)", async () => {
    // Self-transfers on ERC721 are legal (re-approval workflows, some
    // wrap-unwrap flows). The handler must not run the parallel out+in path
    // on the same row id — that would race delete vs set.
    const indexer = createIndexer();
    const safeAddr = addr("erc721-self-xfer");
    seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr });

    // Seed the holding first via a normal inbound, then issue a self-transfer.
    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeRegistration(safeAddr),
      simulateErc721Transfer({
        token: addr("nft"),
        from: addr("external"),
        to: safeAddr,
        tokenId: 5n,
      }),
      simulateErc721Transfer({
        token: addr("nft"),
        from: safeAddr,
        to: safeAddr,
        tokenId: 5n,
      }),
    ]);

    const id = `${CHAIN_ID}-${safeAddr.toLowerCase()}-${addr("nft").toLowerCase()}-5`;
    // Holding must still exist — the self-transfer is recorded immutably in
    // ERC721Transfer but doesn't churn the current-holdings view.
    const holding = await indexer.SafeNftHolding.getOrThrow(id);
    expect(holding.tokenId).toBe(5n);
    expect((await indexer.ERC721Transfer.getAll()).length).toBe(2);
  });

  it("different tokenIds on the same token are tracked independently", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("erc721-multi-id");
    seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr });

    await processOnChain(indexer, CHAIN_ID, [
      simulateSafeRegistration(safeAddr),
      simulateErc721Transfer({ token: addr("nft"), from: addr("ext"), to: safeAddr, tokenId: 1n }),
      simulateErc721Transfer({ token: addr("nft"), from: addr("ext"), to: safeAddr, tokenId: 2n }),
      simulateErc721Transfer({ token: addr("nft"), from: addr("ext"), to: safeAddr, tokenId: 3n }),
    ]);

    const holdings = await indexer.SafeNftHolding.getAll();
    expect(holdings.length).toBe(3);
    expect(holdings.map((h) => h.tokenId).sort()).toEqual([1n, 2n, 3n]);
  });
});
