-- Description: How many Safes are on each version, optionally filtered by chain.
-- Parameters:
--   {{chain_id}} - chainId filter, or 0 for all chains (default: 0)

SELECT
    version,
    count() AS safes
FROM "Safe"
WHERE ({{chain_id}} = 0 OR chainId = {{chain_id}})
GROUP BY version
ORDER BY safes DESC
