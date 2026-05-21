import { createTestIndexer } from "envio";

export type TestIndexer = ReturnType<typeof createTestIndexer>;

// Thin wrapper around envio's createTestIndexer. Each test should get its own
// instance — there is no per-instance reset, the worker is per-indexer.
export function createIndexer(): TestIndexer {
  return createTestIndexer();
}

// Sugar over indexer.process: auto-computes endBlock from the max block.number
// in the simulate items so callers don't have to. Drives a single chain at a
// time; for multi-chain tests, call once per chain or compose manually.
export async function processOnChain(
  indexer: TestIndexer,
  chainId: number,
  // The full simulate-item union is large and Config-dependent; tests build
  // these via the typed builders in events.ts so a loose any[] here is fine
  // (the builder return types are checked at their callsite).
  items: any[],
): Promise<unknown> {
  const maxBlock = items.reduce<number>(
    (acc, it) => Math.max(acc, (it.block?.number as number | undefined) ?? 0),
    0,
  );
  return indexer.process({
    chains: {
      [chainId]: {
        startBlock: 0,
        endBlock: maxBlock + 1,
        simulate: items,
      },
    },
  } as any);
}

// Set the fixtures the in-worker hypersync shim will look up. Call before
// `createIndexer()` because envio's TestIndexer worker snapshots process.env
// at spawn time.
export function setEffectFixtures(
  fixtures: Record<string, Record<string, unknown>>,
): void {
  process.env.ENVIO_TEST_EFFECT_FIXTURES = JSON.stringify(fixtures);
}

export function clearEffectFixtures(): void {
  delete process.env.ENVIO_TEST_EFFECT_FIXTURES;
}

// Pre-seed a Safe entity directly via indexer.<Entity>.set, bypassing the
// ProxyCreation handlers. Useful for tests that exercise downstream behaviour
// (AddedOwner, ExecutionSuccess, etc.) without simulating the full creation
// flow. All required Safe fields are filled with sensible zeros so the entity
// is valid; callers override only what they care about.
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function seedSafe(
  indexer: TestIndexer,
  args: {
    chainId: number;
    address: `0x${string}`;
    version?: string;
    owners?: `0x${string}`[];
    threshold?: number;
    masterCopy?: string;
    fallbackHandler?: string;
    guard?: string;
    nonce?: number;
    numberOfSuccessfulExecutions?: number;
    numberOfFailedExecutions?: number;
    totalGasSpent?: bigint;
  },
): string {
  const id = `${args.chainId}-${args.address.toLowerCase()}`;
  (indexer as any).Safe.set({
    id,
    chainId: args.chainId,
    address: args.address.toLowerCase(),
    version: args.version ?? "V1_3_0",
    owners: (args.owners ?? []).map((o) => o.toLowerCase()),
    threshold: args.threshold ?? 1,
    masterCopy: args.masterCopy,
    fallbackHandler: args.fallbackHandler,
    guard: args.guard ?? ZERO_ADDRESS,
    creationTxHash: "0x" + "0".repeat(64),
    creationTimestamp: 0n,
    initializer: "",
    initiator: "",
    numberOfSuccessfulExecutions: args.numberOfSuccessfulExecutions ?? 0,
    numberOfFailedExecutions: args.numberOfFailedExecutions ?? 0,
    nonce: args.nonce ?? 0,
    totalGasSpent: args.totalGasSpent ?? 0n,
  });
  return id;
}
