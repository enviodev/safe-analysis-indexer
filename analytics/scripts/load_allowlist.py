"""Load src/pricing/tokenAllowlist.json into a ClickHouse `token_allowlist`
table. Run after build-allowlist.ts and discover-pools.ts complete.

Idempotent — TRUNCATE + INSERT on each run.

    uv run python scripts/load_allowlist.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.db import _get_client  # noqa: E402

ALLOWLIST_PATH = (
    Path(__file__).resolve().parent.parent.parent / "src" / "pricing" / "tokenAllowlist.json"
)

DDL = """
CREATE TABLE IF NOT EXISTS token_allowlist (
    chainId       UInt32,
    token         String,
    symbol        String,
    decimals      UInt8,
    category      String,
    marketCapRank UInt16,
    stableUSD     Float64,
    pricingPool   String,
    pricingDex    String,
    PRIMARY KEY (chainId, token)
)
ENGINE = ReplacingMergeTree
ORDER BY (chainId, token);
"""


def main() -> None:
    if not ALLOWLIST_PATH.exists():
        print(f"Missing {ALLOWLIST_PATH}. Run scripts/build-allowlist.ts first.")
        sys.exit(1)

    rows = json.loads(ALLOWLIST_PATH.read_text())
    if not rows:
        print(f"{ALLOWLIST_PATH} is empty. Run scripts/build-allowlist.ts first.")
        sys.exit(1)

    client = _get_client()
    client.command(DDL)
    client.command("TRUNCATE TABLE token_allowlist")

    payload = []
    for r in rows:
        pricing = r.get("pricing", {})
        kind = pricing.get("kind")
        stable_usd = float(pricing["usd"]) if kind == "stable" else 0.0
        payload.append([
            int(r["chainId"]),
            r["token"].lower(),
            r["symbol"],
            int(r["decimals"]),
            r["category"],
            int(r["marketCapRank"]),
            stable_usd,
            pricing.get("pool", "") if kind != "stable" else "",
            pricing.get("dex", "") if kind != "stable" else "stable",
        ])

    client.insert(
        "token_allowlist",
        payload,
        column_names=[
            "chainId", "token", "symbol", "decimals", "category",
            "marketCapRank", "stableUSD", "pricingPool", "pricingDex",
        ],
    )

    print(f"Loaded {len(payload)} rows into token_allowlist.")

    # Print quick coverage by chain so you can sanity-check
    by_chain = {}
    for r in payload:
        by_chain[r[0]] = by_chain.get(r[0], 0) + 1
    print("\nTokens per chain:")
    for chain_id, n in sorted(by_chain.items(), key=lambda x: -x[1]):
        print(f"  {chain_id:>11}  {n:>4}")


if __name__ == "__main__":
    main()
