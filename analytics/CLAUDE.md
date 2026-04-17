# safe-analytics — agent instructions

You are the analytics engine for the Safe indexer. When the user asks a
question about Safes, owners, or ERC20 activity, query ClickHouse, summarise
the answer, and chart it if a chart helps.

## Setup

```bash
uv sync
cp .env.example .env   # defaults already target the local docker-compose ClickHouse
```

ClickHouse must be running (`docker compose up -d` from the repo root).

## ClickHouse connection

Use `lib/db.py` for every query:

```python
from lib.db import query, query_df
rows = query('SELECT count() FROM "ERC20Transfer"')
df = query_df('SELECT chainId, count() AS n FROM "Safe" GROUP BY chainId')
```

- Database: `envio` (set in `.env`, default in the connector).
- Connection is **READ-ONLY**. Never write.
- All queries automatically receive `SETTINGS max_execution_time = 30`.
- Tables are written by the HyperIndex V3 ClickHouse sink (see
  `../docker-compose.yml` and the root-level `config.yaml`). Postgres remains
  the primary DB; ClickHouse is a mirror.

## Critical schema quirk: BigInts and timestamps are strings

The sink preserves `BigInt` precision by storing them as `String`. That
includes:

| Column                             | Stored as | Real type       |
|------------------------------------|-----------|-----------------|
| `ERC20Transfer.blockTimestamp`     | String    | unix seconds    |
| `ERC20Transfer.value`              | String    | UInt256-ish     |
| `Safe.creationTimestamp`           | String    | unix seconds    |
| `Safe.totalGasSpent`               | String    | wei             |
| `SafeTransaction.executionDate`    | String    | unix seconds    |
| `SafeTransaction.value` / `nonce`  | String    | integer         |
| `SafeModuleTransaction.timestamp`  | String    | unix seconds    |

Always cast before arithmetic or display. Use helpers from `lib/filters.py`:

```python
from lib.filters import ts_as_datetime, ts_as_date, recent_days, chain_filter, chain_name_case
```

Inline SQL equivalents:

```sql
-- Cast a String timestamp to DateTime / Date
toDateTime(toUInt64(blockTimestamp))
toDate(toDateTime(toUInt64(blockTimestamp)))

-- Cast the big value to UInt256 for sums
toUInt256OrZero(value)

-- Always quote table names because they are CamelCase (reserved word handling)
SELECT count() FROM "ERC20Transfer"
```

Quote every table name — they are CamelCase and unquoted identifiers are
case-insensitive in ClickHouse.

## Schema reference

### Core entity tables (mirrored from Postgres via the sink)

**`Safe`** — one row per discovered Safe (composite id `chainId-address`).
| Column | Type | Notes |
|---|---|---|
| id | String | `{chainId}-{lowercase address}` |
| address | String | lowercase |
| chainId | Int32 | |
| creationTxHash | String | |
| creationTimestamp | String | **unix seconds** — cast before use |
| owners | Array(String) | current owner set |
| threshold | Int32 | |
| version | Enum8 | `V0_0_2…V1_5_0`, `UNKNOWN` |
| masterCopy | Nullable(String) | singleton; null when unknown |
| initializer | String | |
| initiator | String | |
| numberOfSuccessfulExecutions | Int32 | |
| numberOfFailedExecutions | Int32 | |
| nonce | Int32 | latest observed nonce |
| totalGasSpent | String | wei — cast for sums |

**`ERC20Transfer`** — one row per `Transfer(from,to,value)` event on any token.
| Column | Type | Notes |
|---|---|---|
| id | String | `{chainId}_{block}_{logIndex}` |
| chainId | Int32 | |
| blockNumber | Int32 | |
| blockTimestamp | String | **unix seconds** — cast before use |
| txHash | String | |
| logIndex | Int32 | |
| token | String | emitting contract (lowercase) |
| from | String | lowercase |
| to | String | lowercase |
| value | String | cast with `toUInt256OrZero` |

Wildcard-indexed: every Transfer event on the chain lands here, not just
Safe-related ones. Join to `Safe` when you care about Safe-involved flows.

**`SafeTransaction`** — executed multi-sig transaction.
Key columns: `safe_id`, `chainId`, `to`, `value` (String), `nonce` (String),
`executionDate` (String unix seconds), `txHash`, `success` (Nullable Bool).

**`SafeModuleTransaction`** — execution via a Safe module.
Key columns: `safe_id`, `chainId`, `safeModule`, `to`, `timestamp` (String
unix seconds), `txHash`.

**`SafeOwner`** — link row (id `{owner}-{safeId}`), columns `owner_id`,
`safe_id`.

**`Owner`** — one row per owner address, with `safes: Array(String)` giving
every Safe they control.

**`Network`** — per-chain counters. `Version` — per-Safe-version counters.
`GlobalStats` — single row (`id = 'global'`) with totals.

### Sink-managed tables (ignore for analysis)

`envio_checkpoints`, `envio_history_*`, `dynamic_contract_registry`.

## Chain reference

Currently only zkSync Era (324) is active. The commented-out chains in
`../config.yaml` list the others. `lib.filters.CHAIN_NAMES` holds the full
mapping — use `chain_name_case()` to project a friendly chain name:

```sql
SELECT {chain_name_case('chainId')} AS chain_name, count() ...
```

## Saved queries

See `queries/README.md` for the index. Parameters use `{{name}}` placeholders
with defaults documented in the file header. Workflow:

1. Read the `.sql` file to see its parameters.
2. Substitute `{{param}}` values — use defaults when the user doesn't care.
3. Execute with `lib.db.query()` or `lib.db.query_df()`.

### Question → query map

| User question | Query |
|---|---|
| How many Safes per chain? | `queries/safes/safes_per_chain.sql` |
| How many Safes were created each day? | `queries/safes/safes_created_daily.sql` |
| Which Safes have executed the most txns? | `queries/safes/most_active_safes.sql` |
| What Safe versions are in use? | `queries/versions/version_distribution.sql` |
| Top ERC20 tokens by transfer count? | `queries/transfers/top_tokens.sql` |
| Daily ERC20 transfer volume? | `queries/transfers/transfers_daily.sql` |
| Top tokens moving through Safes? | `queries/transfers/top_tokens_for_safes.sql` |
| Which Safes touched the most tokens? | `queries/transfers/safes_by_token_diversity.sql` |
| Flow in/out for a specific Safe? | `queries/transfers/safe_flow_breakdown.sql` |
| All ERC20 transfers for a specific Safe? | `queries/transfers/safe_transfers.sql` |
| Who owns the most Safes? | `queries/owners/top_owners.sql` |
| How big is the Safe-owner bipartite graph? | `queries/owners/owner_safe_fanout.sql` |

## Charting

```python
from lib.db import query_df
from lib.chart import time_series, bar_chart, stacked_bar, heatmap

df = query_df(open('queries/safes/safes_created_daily.sql').read()
              .replace('{{chain_id}}', '324').replace('{{days}}', '30'))
time_series(df, x='day', y='safes_created', title='Safes created per day',
            filename='safes_daily.png')
```

Charts save as PNG to `output/` (gitignored).

## Snapshots

Weekly JSON snapshots live in `snapshots/weekly/`. Regenerate the most recent
with:

```bash
uv run python scripts/snapshot.py
```

Commit the resulting file to track week-over-week change.

## Workflow rules

1. **Always show the SQL you ran.** The user should be able to reproduce
   results by re-running the query themselves.
2. **Cast BigInt strings** before arithmetic or formatting.
3. **Quote CamelCase table names** (`"Safe"`, `"ERC20Transfer"`, etc.).
4. **Format large numbers** — 1.2M, 345K, 4.2B — via `lib.chart._fmt_number`
   or `tabulate`.
5. **Chain names over IDs** where possible, via `chain_name_case()`.
6. **Default date ranges:** last 7 days for operational questions, last 30
   days for trend questions.
7. **When the user asks to save an analysis**, add a `.sql` file under the
   matching `queries/` subdirectory with the same header comment style as the
   existing files.
8. **Chart proactively** when a shape (trend, distribution, leaderboard)
   would read more clearly visually than as a table.
9. **Bear in mind the indexer may still be backfilling** — report the max
   `blockNumber` / `blockTimestamp` you're reading so the user knows how
   recent the data is.

## Known state (as of this session)

- Chain: zkSync Era (324) only.
- Indexer is mid-backfill; data only covers the early block range so far.
- Handler code + config live at `../src/EventHandlers.ts` and `../config.yaml`.
