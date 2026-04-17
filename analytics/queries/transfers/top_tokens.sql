-- Description: Top ERC20 tokens by Transfer event count on a chain.
-- Parameters:
--   {{chain_id}} - chainId (default: 324)
--   {{days}}    - look-back window, or 0 for all-time (default: 7)
--   {{limit}}   - rows to return (default: 20)

SELECT
    token,
    count()           AS transfers,
    uniqExact(from)   AS unique_senders,
    uniqExact(to)     AS unique_receivers,
    uniqExact(txHash) AS unique_txs
FROM "ERC20Transfer"
WHERE chainId = {{chain_id}}
  AND ({{days}} = 0 OR toDate(toDateTime(toUInt64(blockTimestamp))) >= today() - {{days}})
GROUP BY token
ORDER BY transfers DESC
LIMIT {{limit}}
