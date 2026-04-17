"""SQL fragment helpers for common filter patterns.

The Envio ClickHouse sink stores BigInts and BigInt-like timestamps as
``String`` to preserve precision. These helpers hide that wart: use
``ts_as_datetime`` on any ``*Timestamp`` / ``executionDate`` column before
comparing, truncating, or displaying.
"""

from datetime import date, timedelta


# ---------------------------------------------------------------------------
# Chain filters
# ---------------------------------------------------------------------------

# Friendly labels for the chains we may index. Extend when new chains come on.
CHAIN_NAMES: dict[int, str] = {
    1: "Ethereum",
    10: "Optimism",
    56: "BSC",
    100: "Gnosis",
    137: "Polygon",
    143: "Monad",
    204: "opBNB",
    324: "zkSync Era",
    480: "Worldchain",
    999: "HyperEVM",
    1101: "Polygon zkEVM",
    1313161554: "Aurora",
    5000: "Mantle",
    8453: "Base",
    42161: "Arbitrum",
    42220: "Celo",
    43114: "Avalanche",
    59144: "Linea",
    81457: "Blast",
    534352: "Scroll",
}


def chain_name_case(column: str = "chainId") -> str:
    """Return a SQL CASE expression mapping chainId -> human name.

    Use as a projected column:
        SELECT {chain_name_case()} AS chain_name, ...
    """
    whens = "\n        ".join(
        f"WHEN {cid} THEN '{name}'" for cid, name in CHAIN_NAMES.items()
    )
    return (
        f"CASE {column}\n        {whens}\n"
        f"        ELSE toString({column})\n    END"
    )


def chain_filter(chain_ids: int | list[int] | None) -> str:
    """AND clause restricting to one or more chainIds. Empty when None."""
    if chain_ids is None:
        return ""
    if isinstance(chain_ids, int):
        return f"AND chainId = {chain_ids}"
    ids = ",".join(str(c) for c in chain_ids)
    return f"AND chainId IN ({ids})"


# ---------------------------------------------------------------------------
# Timestamp helpers (schema stores seconds-since-epoch as String)
# ---------------------------------------------------------------------------


def ts_as_datetime(column: str) -> str:
    """Cast a stringified unix-seconds column to a DateTime."""
    return f"toDateTime(toUInt64({column}))"


def ts_as_date(column: str) -> str:
    """Cast a stringified unix-seconds column to a Date."""
    return f"toDate(toDateTime(toUInt64({column})))"


def recent_days(n: int, column: str = "blockTimestamp") -> str:
    """AND clause restricting to the last N days, inclusive of today."""
    start = (date.today() - timedelta(days=n)).isoformat()
    return f"AND {ts_as_date(column)} >= toDate('{start}')"


def recent_weeks(n: int, column: str = "blockTimestamp") -> str:
    """AND clause restricting to the last N weeks."""
    start = (date.today() - timedelta(weeks=n)).isoformat()
    return f"AND {ts_as_date(column)} >= toDate('{start}')"


def date_range(start: str, end: str, column: str = "blockTimestamp") -> str:
    """AND clause for an inclusive [start, end] date range (YYYY-MM-DD)."""
    return (
        f"AND {ts_as_date(column)} >= toDate('{start}') "
        f"AND {ts_as_date(column)} <= toDate('{end}')"
    )


# ---------------------------------------------------------------------------
# Safe / address filters
# ---------------------------------------------------------------------------


def exclude_zero_address(column: str) -> str:
    """Exclude the canonical ERC20 mint/burn counterparty."""
    return f"AND {column} != '0x0000000000000000000000000000000000000000'"


def safe_ids_for_chain(chain_id: int) -> str:
    """Subquery producing the set of known Safe addresses on a chain."""
    return (
        "SELECT address FROM \"Safe\" "
        f"WHERE chainId = {chain_id}"
    )
