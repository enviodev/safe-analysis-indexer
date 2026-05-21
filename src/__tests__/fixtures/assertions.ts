import { expect } from "vitest";
import type { TestIndexer } from "./indexer";

// Asserts the global / per-network / per-version Safe counters match the
// expected values. Pass undefined to skip a layer.
export async function expectSafeCount(
  indexer: TestIndexer,
  expected: {
    global?: number;
    chainId?: number;
    network?: number;
    version?: string;
    versionCount?: number;
  },
): Promise<void> {
  if (expected.global !== undefined) {
    const stats = await indexer.GlobalStats.getOrThrow("global");
    expect(stats.totalSafes, "GlobalStats.totalSafes").toBe(expected.global);
  }
  if (expected.chainId !== undefined && expected.network !== undefined) {
    const network = await indexer.Network.getOrThrow(expected.chainId.toString());
    expect(network.numberOfSafes, `Network(${expected.chainId}).numberOfSafes`).toBe(
      expected.network,
    );
  }
  if (expected.version !== undefined && expected.versionCount !== undefined) {
    const version = await indexer.Version.getOrThrow(expected.version);
    expect(version.numberOfSafes, `Version(${expected.version}).numberOfSafes`).toBe(
      expected.versionCount,
    );
  }
}

export async function expectTxCount(
  indexer: TestIndexer,
  expected: {
    global?: number;
    chainId?: number;
    network?: number;
    version?: string;
    versionCount?: number;
  },
): Promise<void> {
  if (expected.global !== undefined) {
    const stats = await indexer.GlobalStats.getOrThrow("global");
    expect(stats.totalTransactions, "GlobalStats.totalTransactions").toBe(expected.global);
  }
  if (expected.chainId !== undefined && expected.network !== undefined) {
    const network = await indexer.Network.getOrThrow(expected.chainId.toString());
    expect(network.numberOfTransactions, `Network(${expected.chainId}).numberOfTransactions`).toBe(
      expected.network,
    );
  }
  if (expected.version !== undefined && expected.versionCount !== undefined) {
    const version = await indexer.Version.getOrThrow(expected.version);
    expect(version.numberOfTransactions, `Version(${expected.version}).numberOfTransactions`).toBe(
      expected.versionCount,
    );
  }
}

export async function expectModuleTxCount(
  indexer: TestIndexer,
  expected: {
    global?: number;
    chainId?: number;
    network?: number;
    version?: string;
    versionCount?: number;
  },
): Promise<void> {
  if (expected.global !== undefined) {
    const stats = await indexer.GlobalStats.getOrThrow("global");
    expect(stats.totalModuleTransactions, "GlobalStats.totalModuleTransactions").toBe(
      expected.global,
    );
  }
  if (expected.chainId !== undefined && expected.network !== undefined) {
    const network = await indexer.Network.getOrThrow(expected.chainId.toString());
    expect(
      network.numberOfModuleTransactions,
      `Network(${expected.chainId}).numberOfModuleTransactions`,
    ).toBe(expected.network);
  }
  if (expected.version !== undefined && expected.versionCount !== undefined) {
    const version = await indexer.Version.getOrThrow(expected.version);
    expect(
      version.numberOfModuleTransactions,
      `Version(${expected.version}).numberOfModuleTransactions`,
    ).toBe(expected.versionCount);
  }
}

// Asserts the Owner entity contains the given safeIds and that the matching
// SafeOwner join rows exist (lowercase addresses + canonical id format).
export async function expectOwnerMembership(
  indexer: TestIndexer,
  args: { owner: `0x${string}`; safeIds: string[] },
): Promise<void> {
  const owner = await indexer.Owner.getOrThrow(args.owner.toLowerCase());
  for (const safeId of args.safeIds) {
    expect(owner.safes, `Owner(${args.owner}).safes`).toContain(safeId);
    const join = await indexer.SafeOwner.get(`${args.owner.toLowerCase()}-${safeId}`);
    expect(join, `SafeOwner join for ${args.owner}-${safeId}`).toBeDefined();
  }
}

export async function expectNoSafe(indexer: TestIndexer, id: string): Promise<void> {
  const safe = await indexer.Safe.get(id);
  expect(safe, `Safe(${id}) should not exist`).toBeUndefined();
}
