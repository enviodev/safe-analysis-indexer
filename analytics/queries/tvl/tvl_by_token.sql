-- Top tokens by Safe-held USD value. Aggregates same-symbol holdings
-- across chains (e.g. USDC on every L2 rolls up into one row).
SELECT
    a.symbol,
    SUM(
        toFloat64(b.balance) / pow(10, a.decimals) *
        if(a.category = 'stable', a.stableUSD, toFloat64(p.priceUSD))
    ) AS tvl_usd,
    COUNT(DISTINCT b.chainId) AS chains,
    COUNT(DISTINCT (b.chainId, b.safeAddress)) AS safes
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
GROUP BY a.symbol
ORDER BY tvl_usd DESC
LIMIT 50;
