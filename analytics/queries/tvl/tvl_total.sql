-- Current global Safe TVL across all chains, in USD.
-- Joins SafeTokenBalance × token_allowlist × TokenPrice.
-- - Stables price at hardcoded $1 from token_allowlist.stableUSD.
-- - AMM-priced tokens use the latest TokenPrice row.
-- - Tokens not in the allowlist (long-tail) are excluded — by design.
-- - Stale-price guard: 24h max staleness (skip if no recent Swap).
SELECT
    SUM(
        toFloat64(b.balance) / pow(10, a.decimals) *
        if(a.category = 'stable', a.stableUSD, toFloat64(p.priceUSD))
    ) AS tvl_usd,
    COUNT(DISTINCT (b.chainId, b.safeAddress)) AS safes,
    COUNT(DISTINCT (b.chainId, b.token)) AS tokens
FROM "SafeTokenBalance" AS b
INNER JOIN token_allowlist AS a
    ON b.chainId = a.chainId AND b.token = a.token
LEFT JOIN "TokenPrice" AS p
    ON b.chainId = p.chainId AND b.token = p.token
WHERE
    -- exclude tokens with neither a stable peg nor a recent priced swap
    (
        a.category = 'stable'
        OR (
            p.priceUSD IS NOT NULL
            AND toUInt64(p.lastUpdatedTimestamp) > toUnixTimestamp(now()) - 86400
        )
    )
    -- ignore zero balances
    AND toUInt256OrZero(b.balance) > 0
    -- ignore obviously broken on-chain prices (>10x global crypto market cap)
    AND if(a.category = 'stable', a.stableUSD, toFloat64(p.priceUSD)) BETWEEN 0.0001 AND 1000000;
