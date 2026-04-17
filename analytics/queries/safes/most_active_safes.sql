-- Description: Safes ranked by successful execution count on a chain.
-- Parameters:
--   {{chain_id}} - chainId to filter on (default: 324)
--   {{limit}}   - number of rows to return (default: 20)

SELECT
    address,
    version,
    numberOfSuccessfulExecutions AS successful_execs,
    numberOfFailedExecutions AS failed_execs,
    length(owners) AS owner_count,
    threshold,
    toDateTime(toUInt64(creationTimestamp)) AS created_at,
    toUInt256OrZero(totalGasSpent) AS total_gas_spent_wei
FROM "Safe"
WHERE chainId = {{chain_id}}
ORDER BY numberOfSuccessfulExecutions DESC
LIMIT {{limit}}
