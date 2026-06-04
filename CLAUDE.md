# Agent onboarding

Orientation for an agent (Claude or otherwise) coming to this repo fresh. The
human-facing project intro lives in [`README.md`](./README.md) — this file
covers the workflow, conventions, and tooling that aren't obvious from the code
alone.

## What this is

An [Envio HyperIndex](https://docs.envio.dev) indexer that tracks Gnosis Safe
contracts across multiple EVM chains. Schema in `schema.graphql`, chain config
in `config.yaml`, handlers in `src/EventHandlers.ts`. Stores into Postgres
(with an optional ClickHouse sink mirror).

Cross-references published Safe state with the canonical
[Safe Transaction Service](https://github.com/safe-global/safe-transaction-service)
REST API via a sampled integration test suite (`src/__integration__/`).

## Setup

```bash
pnpm install
pnpm codegen
```

Node 22+ is required (`package.json#engines`).

## Common commands

| Command | When to run |
|---|---|
| `pnpm codegen` | After any change to `schema.graphql` or `config.yaml`. |
| `pnpm tsc --noEmit` | After any TypeScript change — fast structural check. |
| `pnpm test` | Run unit tests (every PR also runs these in CI). |
| `pnpm test:integration` | Run the cross-reference suite against a deployed indexer. See below. |
| `pnpm dev` | Local indexer dev server. |

When unsure, the cycle is: edit → `pnpm codegen` (if schema/config) → `pnpm tsc --noEmit` → `pnpm test`.

## Repo layout

```
config.yaml                    # chain config + contract / event subscriptions
schema.graphql                 # GraphQL entities exposed by the indexer
src/
  EventHandlers.ts             # all event handlers — wildcard + per-contract
  helpers.ts                   # ensureSafeStub, stat counters, owner mgmt
  consts.ts                    # SafeVersion enum, master-copy mapping, L1/L2 detection
  hypersync.ts                 # RPC effects, setupData decode chain, trace walking
  AmmPricing.ts, pricing/      # token pricing (analytics branch — out of scope on main)
  __tests__/                   # unit tests + simulator fixtures
    fixtures/
      events.ts                # simulate<EventName>() helpers
      indexer.ts               # createIndexer / processOnChain / seedSafe
      addresses.ts             # canonical MASTER_COPIES + addr(seed) helper
  __integration__/             # cross-reference suite (deployed-indexer vs STS REST)
    crossReference.test.ts     # test runner — reads env vars (see below)
    clients/                   # safeApi (REST) + indexerApi (GraphQL) wrappers
    normalize.ts               # both-sides → NormalisedSafe / NormalisedSafeCreation / ...
    comparators/               # one per entity — returns DiffResult
    samplers.ts                # owner-anchored, recent-activity, indexer-direct
local/                         # gitignored; recommended for reference checkouts
```

## How the handlers work (mental model)

- **Wildcard events**: events like `SafeSetup`, `ChangedGuard`, `ExecutionSuccess` fire on every Safe and are subscribed via `indexer.onEvent({ contract: "GnosisSafeL2", event: "...", wildcard: true })`. The Safe address is `event.srcAddress`.
- **`ensureSafeStub`** (`src/helpers.ts`): wildcard handlers can fire BEFORE the Safe entity exists (e.g. setup()-time delegate-call patterns emit `EnabledModule` before `SafeSetup`). The stub creates a placeholder so the state change isn't dropped.
- **Preload + execution passes**: HyperIndex runs each handler twice — once to discover entity reads/effects for batching, then for real. Module-level state (e.g. dedup sets) MUST be gated on `context.isPreload` or it will be populated during preload and short-circuit real writes. There is a regression test for this — search for `executionDedup`.
- **`counted` flag on `Safe`**: tracks whether the Safe has been counted in Global/Network/Version stats. Only the canonical `ProxyCreation` event flips it true. Stub paths (`ensureSafeStub`, SafeSetup-only orphans, RPC-backfilled orphans) stay `counted: false`, and stat-mutating handlers (e.g. `ChangedMasterCopy`) guard on this flag to avoid phantom counts.
- **RPC effects**: heavy fetches (e.g. `eth_getStorageAt` for masterCopy backfill, `trace_transaction` for the creator walk) go through `context.effect(fn, input)`. Effects are cached on input — re-runs are free.

When adding a new handler, look for the closest existing handler with similar semantics and copy the pattern (stub-or-bail, preserve-existing-fields, `counted` guarding). Schema docstrings in `schema.graphql` are load-bearing — keep them up to date.

## Testing

### Unit tests (`pnpm test`)

Lives in `src/__tests__/`. Each test file simulates a sequence of on-chain events through a fixture indexer (`createIndexer()` → `processOnChain(indexer, chainId, events)`) and asserts on the resulting entities. Use the existing `simulate*` helpers in `fixtures/events.ts` when adding tests for new events; add a new simulator there if you're subscribing to a new event shape.

The simulator path bypasses HyperSync-level filters (e.g. the address-pool filter on the ERC20 watcher). That means tests can't exercise filtering behaviour — note this in the test file when relevant. Production indexing is what proves the filter works.

### Integration tests (`pnpm test:integration`)

Cross-references a deployed indexer against the canonical Safe Transaction Service REST API. Sample size and chain set come from env vars; reads `.env` at the project root if present (shell-set vars win).

| Env var | Default | Notes |
|---|---|---|
| `INTEGRATION_INDEXER_ENDPOINT` | (required) | GraphQL URL — no default; deployment hashes rotate too often for a baked-in URL. Example: `https://indexer.eu.hyperindex.xyz/<hash>/v1/graphql`. |
| `INTEGRATION_SAMPLE_SIZE` | `10` | Safes per chain. 100 is a good "rich" sample; 10 is fast smoke. |
| `INTEGRATION_CHAINS` | `1,100` | Comma-separated chain IDs. Today: Ethereum (1), Gnosis (100). |
| `INTEGRATION_SKIP_PING` | unset | Set to `1` to skip the indexer-reachable preflight check. |

The suite samples Safes three ways (`owner-anchored`, `recent-activity`, `indexer-direct`), runs four comparators per Safe (`metadata`, `creation`, `multisigTxs`, `moduleTxs`), and prints a summary table at the end. Each mismatch logs a `╭─ MISMATCH ...` block to stderr showing the field-level diff between canonical and indexer values.

**Schema-skew caveat:** the integration query references the *current* schema. If the deployed indexer is on an older schema (e.g. before a recent field was added), the GraphQL query will fail. Run the integration suite from a worktree pinned to the deployed commit:

```bash
git worktree add /tmp/safe-<short-sha> <deployed-sha>
cd /tmp/safe-<short-sha>
pnpm install
pnpm codegen
INTEGRATION_INDEXER_ENDPOINT="https://..." INTEGRATION_SAMPLE_SIZE=100 pnpm test:integration
```

Then `git worktree remove --force /tmp/safe-<short-sha>` when done.

## Reference: Safe Transaction Service

The canonical Safe team indexer lives at
[`safe-global/safe-transaction-service`](https://github.com/safe-global/safe-transaction-service).
We mirror many of its decisions — version detection, creator walking, setupData
wrapper peeling — and the cross-reference suite uses its REST API as ground
truth.

Cloning it into `local/` (which is gitignored) makes it easy to grep:

```bash
git clone https://github.com/safe-global/safe-transaction-service.git local/safe-transaction-service
```

A copy of the STS OpenAPI spec lives at
`local/Safe Transaction Service.yaml` for reference on response shapes.

Useful entry points when cross-referencing logic:

| Behaviour | STS file / function |
|---|---|
| setupData decoder chain (MultiSend, Gelato, CPK) | `safe_transaction_service/history/services/safe_service.py::_decode_creation_data` |
| Direct factory decode | `safe_service.py::_decode_proxy_factory` |
| CPK proxy factory | `safe_service.py::_decode_cpk_proxy_factory` |
| Gelato Relay unwrap | `safe_service.py::_decode_gelato_relay` |
| `creator` resolution from trace tree | `safe_service.py` (look for `parent_internal_tx`) |
| ProxyCreation event subscriptions | `proxy_factory_indexer.py` |
| Off-chain message handling | `safe_messages/` |

Search there before reinventing — and when behaviour intentionally diverges
from STS, leave a comment on the divergence.

## Git + PR workflow

- **`main` is PR-gated.** Direct pushes are blocked by branch protection. All changes land via pull request.
- Branch from `main`, name `<initials>/<short-feature>` (e.g. `dp/multisend-peeling`). One PR per logically separate change — `feat:`, `fix:`, `chore:` prefixes in the commit subject.
- Required CI (`.github/workflows/test.yml`): `pnpm install --frozen-lockfile && pnpm codegen && pnpm test`. Don't bypass it.
- When an AI assistant helped meaningfully, include a `Co-Authored-By:` trailer on the commit.
- **Stack PRs** when the next change builds on an unmerged one (e.g. extending a decoder, adding a follow-on feature). Use `gh pr create --base <parent-branch> ...` — GitHub auto-rebases the target as the parent merges.

When a PR triggers CodeRabbit review, treat its inline comments as a checklist: verify each finding against the current code, fix what's still valid, push a follow-up commit, and reply on the PR briefly noting what was addressed.

## Common gotchas

- **Schema/config changes**: run `pnpm codegen` before `pnpm tsc --noEmit`. Generated types live under `generated/` and `.envio/` (both gitignored).
- **Entity references**: schema uses entity references (`safe: Safe!`); handlers use the `_id` suffix codegen adds (`safe_id: safeId`). Never write the bare field name in `Entity.set()`.
- **Spread to update**: entities returned from `context.Entity.get()` are read-only. Always `context.Entity.set({ ...existing, field: newValue })`.
- **BigInt arithmetic**: `Safe.nonce` and most token values are BigInt; use `1n` literals and BigInt-typed math, not `Number`.
- **Lowercase addresses**: all address fields in entities are lowercase. Use `.toLowerCase()` on `event.srcAddress`, `event.params.*` addresses, etc. before writing.
- **Module-level state**: any `Set`/`Map` declared at module scope persists across blocks and across preload/execution passes. Gate writes on `!context.isPreload` (see `processedExecutions` in `helpers.ts`).
- **`UNKNOWN` version sentinel**: stub Safes start as `version: "UNKNOWN"` (an enum literal, not null). Handlers that derive version from masterCopy should preserve non-UNKNOWN existing values to avoid clobbering state-mutation events that fired earlier in log order.

## RabbitMQ event publisher

The indexer can publish Safe Transaction Service-compatible JSON events to a
RabbitMQ exchange whenever an on-chain event matches one of Safe's webhook
types (see `src/safeEvents.ts` for the supported list). Downstream consumers
can then subscribe via [`safe-events-service`](https://github.com/safe-global/safe-events-service)
without any client-side changes.

Three env vars (all `ENVIO_`-prefixed so envio-cloud passes them through):

| Var | Required | Description |
|---|---|---|
| `ENVIO_AMQP_PUBLISH_ENABLED` | No (default `false`) | Hard toggle. Unset or `false` → publisher is a permanent no-op. Production typically runs two instances side-by-side (one publishing, one not). |
| `ENVIO_AMQP_URL` | When publishing | RabbitMQ connection URL. Scheme picks protocol + default port: `amqp://` → 5672 (plain), `amqps://` → 5671 (TLS). |
| `ENVIO_AMQP_PORT` | No | Optional port override. Replaces any port in the URL. Set this only for non-standard broker ports. |
| `ENVIO_AMQP_EXCHANGE` | When publishing | Exchange name. Asserted as `fanout` + `durable` (mirrors Safe TX Service's setup). Must match what your downstream consumer subscribes to. |

The publisher only fires when **all** chains have caught up to head
(`context.chain.isRealtime === true`) and we're outside the preload pass —
historical sync never emits anything. Failures are fire-and-forget (logged,
dropped); per the Safe events spec consumers fall back to the canonical REST
API for source-of-truth.

Off-chain Safe event types (`NEW_CONFIRMATION`, `PENDING_MULTISIG_TRANSACTION`,
`DELETED_MULTISIG_TRANSACTION`, `MESSAGE_*`, `*_DELEGATE`, `OUTGOING_ETHER`,
`REORG_DETECTED`) are deliberately not emitted — we have no way to observe
them from on-chain data alone.

## Further reading

- [Envio HyperIndex docs](https://docs.envio.dev) — handler API, wildcard events, effects, schema reference.
- [Envio LLM-formatted reference](https://docs.envio.dev/docs/HyperIndex-LLM/hyperindex-complete) — single-page reference suitable for in-context reading.
- Skill files under `.claude/skills/` (if present) — codified guidance on handler syntax, schema patterns, and filtering.
