-- Sanity-check the curated allowlist: what % of Safe-held value falls
-- inside our priced universe vs unknown long-tail tokens?
--
-- The "covered" branch needs a real USD value, so we project unknown
-- token holdings into a denominator using a worst-case approximation:
-- count distinct (chainId, token) entries that have ANY balance, split
-- by whether they appear in token_allowlist with a usable price.
--
-- A more rigorous coverage metric (USD coverage) requires pricing the
-- uncovered tokens too, which we deliberately don't do. Use this query
-- to estimate how much of Safe TVL we're capturing — if the priced
-- token count drops below ~70% of all (Safe, token) pairs with non-zero
-- balance, we should expand the allowlist or investigate.
SELECT
    countIf(
        a.token != '' AND (
            a.category = 'stable' OR p.priceUSD IS NOT NULL
        )
    ) AS priced_pairs,
    countIf(a.token = '' OR (a.category != 'stable' AND p.priceUSD IS NULL)) AS unpriced_pairs,
    round(
        countIf(
            a.token != '' AND (
                a.category = 'stable' OR p.priceUSD IS NOT NULL
            )
        ) / count() * 100,
        1
    ) AS priced_pct,
    SUM(if(
        a.token != '' AND (a.category = 'stable' OR p.priceUSD IS NOT NULL),
        toFloat64(b.balance) / pow(10, ifNull(a.decimals, 18)) *
            if(a.category = 'stable', a.stableUSD, toFloat64(p.priceUSD)),
        0
    )) AS covered_tvl_usd
FROM "SafeTokenBalance" AS b
LEFT JOIN token_allowlist AS a
    ON b.chainId = a.chainId AND b.token = a.token
LEFT JOIN "TokenPrice" AS p
    ON b.chainId = p.chainId AND b.token = p.token
WHERE toUInt256OrZero(b.balance) > 0;
