-- Description: Per-token inbound vs outbound Transfer count for a Safe address, across every indexed chain.
-- Safe addresses are deterministic across EVM chains so we don't filter by chainId.
-- Parameters:
--   {{address}} - lowercase Safe address
--   {{limit}}   - rows to return (default: 30)

SELECT
    chainId,
    token,
    countIf(lower(to)   = '{{address}}') AS inbound,
    countIf(lower(from) = '{{address}}') AS outbound,
    count()                              AS total
FROM "ERC20Transfer"
WHERE lower(from) = '{{address}}' OR lower(to) = '{{address}}'
GROUP BY chainId, token
ORDER BY total DESC
LIMIT {{limit}}
