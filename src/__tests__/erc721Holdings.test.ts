import { describe, it, expect } from "vitest";
import { addr } from "./fixtures/addresses";
import { createIndexer, processOnChain, seedSafe } from "./fixtures/indexer";
import { simulateErc721Transfer } from "./fixtures/events";

const CHAIN_ID = 1;

// Same simulator-bypass caveat as the ERC20 watcher tests: the production
// `where` filter on chain.SafeErc721Watcher.addresses runs at HyperSync source
// only, so simulate() delivers every event regardless of whether either
// endpoint is a known Safe. The handler is the only thing under test here.

describe("SafeErc721Watcher.Transfer", () => {
  it("writes an ERC721Transfer row but no SafeNftHolding when neither side is a Safe", async () => {
    const indexer = createIndexer();
    await processOnChain(indexer, CHAIN_ID, [
      simulateErc721Transfer({
        token: addr("nft"),
        from: addr("not-a-safe-from"),
        to: addr("not-a-safe-to"),
        tokenId: 1n,
      }),
    ]);
    const transfers = await indexer.ERC721Transfer.getAll();
    expect(transfers.length).toBe(1);
    expect(await indexer.SafeNftHolding.getAll()).toEqual([]);
  });

  it("inbound to a Safe creates SafeNftHolding with the acquire context", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("erc721-recv-safe");
    seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr });

    await processOnChain(indexer, CHAIN_ID, [
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

  it("different tokenIds on the same token are tracked independently", async () => {
    const indexer = createIndexer();
    const safeAddr = addr("erc721-multi-id");
    seedSafe(indexer, { chainId: CHAIN_ID, address: safeAddr });

    await processOnChain(indexer, CHAIN_ID, [
      simulateErc721Transfer({ token: addr("nft"), from: addr("ext"), to: safeAddr, tokenId: 1n }),
      simulateErc721Transfer({ token: addr("nft"), from: addr("ext"), to: safeAddr, tokenId: 2n }),
      simulateErc721Transfer({ token: addr("nft"), from: addr("ext"), to: safeAddr, tokenId: 3n }),
    ]);

    const holdings = await indexer.SafeNftHolding.getAll();
    expect(holdings.length).toBe(3);
    expect(holdings.map((h) => h.tokenId).sort()).toEqual([1n, 2n, 3n]);
  });
});
