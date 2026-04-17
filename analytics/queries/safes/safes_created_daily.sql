-- Description: New Safes discovered per day for a chain.
-- Parameters:
--   {{chain_id}} - chainId to filter on (default: 324)
--   {{days}}    - number of days to look back (default: 30)

SELECT
    toDate(toDateTime(toUInt64(creationTimestamp))) AS day,
    count() AS safes_created
FROM "Safe"
WHERE chainId = {{chain_id}}
  AND toDate(toDateTime(toUInt64(creationTimestamp))) >= today() - {{days}}
GROUP BY day
ORDER BY day
