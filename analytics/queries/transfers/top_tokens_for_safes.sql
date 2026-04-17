-- Description: Top tokens whose transfers touch a discovered Safe (as sender or receiver).
-- Parameters:
--   {{chain_id}} - chainId (default: 324)
--   {{days}}    - look-back window, or 0 for all-time (default: 30)
--   {{limit}}   - rows to return (default: 20)

WITH safes AS (
    SELECT address FROM "Safe" WHERE chainId = {{chain_id}}
)
SELECT
    t.token,
    count()                                                            AS transfers,
    countIf(t.to   IN (SELECT address FROM safes))                     AS inbound,
    countIf(t.from IN (SELECT address FROM safes))                     AS outbound,
    uniqExactIf(t.to,   t.to   IN (SELECT address FROM safes))         AS safes_receiving,
    uniqExactIf(t.from, t.from IN (SELECT address FROM safes))         AS safes_sending
FROM "ERC20Transfer" t
WHERE t.chainId = {{chain_id}}
  AND ({{days}} = 0 OR toDate(toDateTime(toUInt64(t.blockTimestamp))) >= today() - {{days}})
  AND (t.to IN (SELECT address FROM safes) OR t.from IN (SELECT address FROM safes))
GROUP BY t.token
ORDER BY transfers DESC
LIMIT {{limit}}
