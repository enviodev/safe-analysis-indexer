-- Description: Daily ERC20 Transfer event count for a chain.
-- Parameters:
--   {{chain_id}} - chainId (default: 324)
--   {{days}}    - number of days to look back (default: 30)

SELECT
    toDate(toDateTime(toUInt64(blockTimestamp))) AS day,
    count()                                      AS transfers,
    uniqExact(token)                             AS unique_tokens,
    uniqExact(from)                              AS unique_senders,
    uniqExact(to)                                AS unique_receivers
FROM "ERC20Transfer"
WHERE chainId = {{chain_id}}
  AND toDate(toDateTime(toUInt64(blockTimestamp))) >= today() - {{days}}
GROUP BY day
ORDER BY day
