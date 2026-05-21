-- Top 50 Safes by USD TVL. Useful for "which Safes hold the most value"
-- and as a sanity-check that our pricing covers the meaningful balances.
SELECT
    b.chainId,
    b.safeAddress,
    SUM(
        toFloat64(b.balance) / pow(10, a.decimals) *
        if(a.category = 'stable', a.stableUSD, toFloat64(p.priceUSD))
    ) AS tvl_usd,
    COUNT(DISTINCT b.token) AS distinct_tokens
FROM "SafeTokenBalance" AS b
INNER JOIN token_allowlist AS a
    ON b.chainId = a.chainId AND b.token = a.token
LEFT JOIN "TokenPrice" AS p
    ON b.chainId = p.chainId AND b.token = p.token
WHERE
    (
        a.category = 'stable'
        OR (
            p.priceUSD IS NOT NULL
            AND toUInt64(p.lastUpdatedTimestamp) > toUnixTimestamp(now()) - 86400
        )
    )
    AND toUInt256OrZero(b.balance) > 0
    AND if(a.category = 'stable', a.stableUSD, toFloat64(p.priceUSD)) BETWEEN 0.0001 AND 1000000
GROUP BY b.chainId, b.safeAddress
ORDER BY tvl_usd DESC
LIMIT 50;
