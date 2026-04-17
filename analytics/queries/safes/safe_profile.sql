-- Description: Everything we know about a specific Safe (core row + counts).
-- Parameters:
--   {{chain_id}} - chainId
--   {{address}}  - lowercase Safe address

WITH safe_row AS (
    SELECT *
    FROM "Safe"
    WHERE chainId = {{chain_id}} AND address = '{{address}}'
    LIMIT 1
),
tx_counts AS (
    SELECT
        countIf(success = true)  AS success_tx,
        countIf(success = false) AS failed_tx,
        count()                  AS total_tx
    FROM "SafeTransaction"
    WHERE chainId = {{chain_id}}
      AND safe_id = concat(toString({{chain_id}}), '-', '{{address}}')
),
module_counts AS (
    SELECT count() AS module_tx
    FROM "SafeModuleTransaction"
    WHERE chainId = {{chain_id}}
      AND safe_id = concat(toString({{chain_id}}), '-', '{{address}}')
),
transfer_counts AS (
    SELECT
        countIf(lower(to)   = '{{address}}') AS inbound_transfers,
        countIf(lower(from) = '{{address}}') AS outbound_transfers,
        uniqExact(token)                     AS unique_tokens
    FROM "ERC20Transfer"
    WHERE chainId = {{chain_id}}
      AND (lower(to) = '{{address}}' OR lower(from) = '{{address}}')
)
SELECT
    s.address,
    s.version,
    s.threshold,
    length(s.owners) AS owner_count,
    s.owners,
    s.masterCopy,
    toDateTime(toUInt64(s.creationTimestamp)) AS created_at,
    s.creationTxHash,
    tx.success_tx,
    tx.failed_tx,
    tx.total_tx,
    m.module_tx,
    t.inbound_transfers,
    t.outbound_transfers,
    t.unique_tokens
FROM safe_row s
CROSS JOIN tx_counts tx
CROSS JOIN module_counts m
CROSS JOIN transfer_counts t
