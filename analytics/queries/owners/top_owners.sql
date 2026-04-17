-- Description: Owners controlling the most Safes.
-- Parameters:
--   {{limit}} - rows to return (default: 20)

SELECT
    id AS owner,
    length(safes) AS safes_count
FROM "Owner"
ORDER BY safes_count DESC
LIMIT {{limit}}
