"""Generate a weekly snapshot of Safe-indexer metrics from ClickHouse."""

import json
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.db import query  # noqa: E402


def get_week_bounds() -> tuple[date, date]:
    """Most recent complete Monday-Sunday week (end = last Sunday)."""
    today = date.today()
    end = today - timedelta(days=today.weekday() + 1)
    start = end - timedelta(days=6)
    return start, end


def iso_week_label(d: date) -> str:
    iso = d.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


def generate_snapshot() -> dict:
    start, end = get_week_bounds()
    label = iso_week_label(start)
    print(f"Generating snapshot for {label} ({start} to {end})")

    # Overall counters ------------------------------------------------------
    totals = query('''
        SELECT
            (SELECT count() FROM "Safe")                  AS safes_total,
            (SELECT count() FROM "ERC20Transfer")         AS transfers_total,
            (SELECT count() FROM "SafeTransaction")       AS safe_txs_total,
            (SELECT count() FROM "SafeModuleTransaction") AS safe_module_txs_total,
            (SELECT count() FROM "Owner")                 AS owners_total
    ''')[0]

    # Weekly slices ---------------------------------------------------------
    weekly = query(f'''
        SELECT
            countIf(toDate(toDateTime(toUInt64(creationTimestamp)))
                    BETWEEN toDate('{start}') AND toDate('{end}'))
                AS safes_created_this_week
        FROM "Safe"
    ''')[0]

    transfers_this_week = query(f'''
        SELECT count() AS n
        FROM "ERC20Transfer"
        WHERE toDate(toDateTime(toUInt64(blockTimestamp)))
              BETWEEN toDate('{start}') AND toDate('{end}')
    ''')[0]["n"]

    # Per-chain counts ------------------------------------------------------
    safes_per_chain = query('''
        SELECT chainId, count() AS safes
        FROM "Safe"
        GROUP BY chainId
        ORDER BY safes DESC
    ''')

    transfers_per_chain = query('''
        SELECT chainId, count() AS transfers
        FROM "ERC20Transfer"
        GROUP BY chainId
        ORDER BY transfers DESC
    ''')

    # Version mix -----------------------------------------------------------
    version_dist = query('''
        SELECT toString(version) AS version, count() AS safes
        FROM "Safe"
        GROUP BY version
        ORDER BY safes DESC
    ''')

    # Top tokens this week across all chains --------------------------------
    top_tokens = query(f'''
        SELECT
            token,
            count() AS transfers,
            uniqExact(from) AS unique_senders,
            uniqExact(to)   AS unique_receivers
        FROM "ERC20Transfer"
        WHERE toDate(toDateTime(toUInt64(blockTimestamp)))
              BETWEEN toDate('{start}') AND toDate('{end}')
        GROUP BY token
        ORDER BY transfers DESC
        LIMIT 10
    ''')

    # Data-coverage sanity check -------------------------------------------
    coverage = query('''
        SELECT
            chainId,
            max(blockNumber) AS max_block,
            toDateTime(toUInt64(max(blockTimestamp))) AS max_ts
        FROM "ERC20Transfer"
        GROUP BY chainId
        ORDER BY chainId
    ''')

    snapshot = {
        "week": label,
        "period_start": str(start),
        "period_end": str(end),
        "totals": {
            "safes": totals["safes_total"],
            "erc20_transfers": totals["transfers_total"],
            "safe_txs": totals["safe_txs_total"],
            "safe_module_txs": totals["safe_module_txs_total"],
            "owners": totals["owners_total"],
        },
        "this_week": {
            "safes_created": weekly["safes_created_this_week"],
            "erc20_transfers": transfers_this_week,
        },
        "safes_per_chain": [
            {"chainId": r["chainId"], "safes": r["safes"]} for r in safes_per_chain
        ],
        "transfers_per_chain": [
            {"chainId": r["chainId"], "transfers": r["transfers"]}
            for r in transfers_per_chain
        ],
        "version_distribution": [
            {"version": r["version"], "safes": r["safes"]} for r in version_dist
        ],
        "top_tokens_this_week": [
            {
                "token": r["token"],
                "transfers": r["transfers"],
                "unique_senders": r["unique_senders"],
                "unique_receivers": r["unique_receivers"],
            }
            for r in top_tokens
        ],
        "coverage": [
            {
                "chainId": r["chainId"],
                "max_block": r["max_block"],
                "max_ts": str(r["max_ts"]),
            }
            for r in coverage
        ],
    }

    out_dir = Path(__file__).resolve().parent.parent / "snapshots" / "weekly"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{label}.json"
    out_path.write_text(json.dumps(snapshot, indent=2, default=str) + "\n")
    print(f"Snapshot written to {out_path}")
    return snapshot


if __name__ == "__main__":
    generate_snapshot()
