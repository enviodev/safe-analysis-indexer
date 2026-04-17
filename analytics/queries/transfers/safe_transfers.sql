-- Description: Raw list of ERC20 Transfer events touching a Safe address across every indexed chain.
-- Safe addresses are deterministic across EVM chains, so we don't filter by chainId.
-- Parameters:
--   {{address}} - lowercase Safe address
--   {{limit}}   - rows to return (default: 100)

SELECT
    chainId,
    toDateTime(toUInt64(blockTimestamp)) AS ts,
    blockNumber,
    txHash,
    logIndex,
    token,
    from,
    to,
    if(lower(from) = '{{address}}', 'OUT', 'IN') AS direction,
    value
FROM "ERC20Transfer"
WHERE lower(from) = '{{address}}' OR lower(to) = '{{address}}'
ORDER BY ts DESC, blockNumber DESC, logIndex DESC
LIMIT {{limit}}
