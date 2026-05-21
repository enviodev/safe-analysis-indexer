# TVL queries

USD-denominated total-value-locked metrics across the Safe indexer.

## Pre-requisites

These queries depend on:

1. **`token_allowlist`** ClickHouse table. Loaded by
   `analytics/scripts/load_allowlist.py` from
   `src/pricing/tokenAllowlist.json` (the curated CoinGecko top-500
   subset — built by `scripts/build-allowlist.ts` then enriched with
   pool addresses by `scripts/discover-pools.ts`).

2. **`TokenPrice`** entity table. Populated live by
   `src/AmmPricing.ts` from on-chain Swap events on the curated pool
   set (`src/pricing/poolLookup.json`).

The setup sequence after a fresh indexer run:

```bash
pnpm tsx scripts/build-allowlist.ts          # ~17min, CoinGecko free tier
pnpm tsx scripts/discover-pools.ts           # ~5min, RPC factory queries
pnpm tsx scripts/generate-pool-config.ts     # config.yaml gets pool addresses
pnpm dev -r                                   # restart indexer; AMM swaps populate TokenPrice
cd analytics && uv run python scripts/load_allowlist.py
```

## Queries

| File | Question |
|---|---|
| `tvl_total.sql` | Current global Safe TVL (USD). |
| `tvl_by_network.sql` | TVL per chain. |
| `tvl_by_token.sql` | TVL by token symbol (rolled up across chains). |
| `top_safes_by_tvl.sql` | Top 50 Safes by USD value held. |
| `tvl_coverage.sql` | % of Safe (chain, token) pairs with non-zero balance that we can price. Sanity-check for allowlist completeness. |

## Caveats

- **Head-only pricing**: stale prices (>24h since last Swap on the pool)
  are excluded. Low-liquidity tokens that don't trade often will silently
  drop out of TVL during the gap.
- **Long-tail tokens are unpriced** by design. `tvl_coverage.sql` reports
  what we're missing.
- **`priceUSD` lives as `BigDecimal` in the schema, `String` in
  ClickHouse**. Cast with `toFloat64()` before arithmetic.
- **Stables are hardcoded $1.00** via `token_allowlist.stableUSD`. Real
  depegs aren't reflected — accept this for TVL-as-aggregate.
