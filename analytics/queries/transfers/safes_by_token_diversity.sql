-- Description: Safes ranked by number of distinct ERC20 tokens they've touched.
-- Parameters:
--   {{chain_id}} - chainId (default: 324)
--   {{limit}}   - rows to return (default: 20)

WITH safes AS (
    SELECT address FROM "Safe" WHERE chainId = {{chain_id}}
),
touches AS (
    SELECT to   AS safe_address, token FROM "ERC20Transfer"
    WHERE chainId = {{chain_id}} AND to   IN (SELECT address FROM safes)
    UNION ALL
    SELECT from AS safe_address, token FROM "ERC20Transfer"
    WHERE chainId = {{chain_id}} AND from IN (SELECT address FROM safes)
)
SELECT
    safe_address,
    uniqExact(token) AS unique_tokens,
    count()          AS transfer_legs
FROM touches
GROUP BY safe_address
ORDER BY unique_tokens DESC
LIMIT {{limit}}
