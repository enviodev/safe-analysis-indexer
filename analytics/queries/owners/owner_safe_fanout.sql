-- Description: Histogram of owner -> Safe fanout (how many owners control N Safes).
-- Parameters: none

SELECT
    length(safes) AS safes_per_owner,
    count()       AS owner_count
FROM "Owner"
GROUP BY safes_per_owner
ORDER BY safes_per_owner
