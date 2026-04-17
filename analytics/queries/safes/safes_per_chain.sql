-- Description: Number of Safes discovered per chain.
-- Parameters: none

SELECT
    chainId,
    CASE chainId
        WHEN 1 THEN 'Ethereum'
        WHEN 10 THEN 'Optimism'
        WHEN 56 THEN 'BSC'
        WHEN 100 THEN 'Gnosis'
        WHEN 137 THEN 'Polygon'
        WHEN 143 THEN 'Monad'
        WHEN 204 THEN 'opBNB'
        WHEN 324 THEN 'zkSync Era'
        WHEN 480 THEN 'Worldchain'
        WHEN 999 THEN 'HyperEVM'
        WHEN 1101 THEN 'Polygon zkEVM'
        WHEN 1313161554 THEN 'Aurora'
        WHEN 5000 THEN 'Mantle'
        WHEN 8453 THEN 'Base'
        WHEN 42161 THEN 'Arbitrum'
        WHEN 42220 THEN 'Celo'
        WHEN 43114 THEN 'Avalanche'
        WHEN 59144 THEN 'Linea'
        WHEN 81457 THEN 'Blast'
        WHEN 534352 THEN 'Scroll'
        ELSE toString(chainId)
    END AS chain_name,
    count() AS safes
FROM "Safe"
GROUP BY chainId
ORDER BY safes DESC
