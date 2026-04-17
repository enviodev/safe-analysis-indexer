"""ClickHouse read-only connector for the Safe indexer sink."""

import os
from pathlib import Path

import clickhouse_connect
import pandas as pd
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = clickhouse_connect.get_client(
            host=os.environ["CLICKHOUSE_HOST"],
            port=int(os.environ["CLICKHOUSE_PORT"]),
            username=os.environ["CLICKHOUSE_USER"],
            password=os.environ["CLICKHOUSE_PASSWORD"],
            database=os.environ.get("CLICKHOUSE_DATABASE", "envio"),
        )
    return _client


def query(sql: str) -> list[dict]:
    """Execute a read-only query and return rows as list of dicts."""
    sql = _add_settings(sql)
    result = _get_client().query(sql)
    columns = result.column_names
    return [dict(zip(columns, row)) for row in result.result_rows]


def query_df(sql: str) -> pd.DataFrame:
    """Execute a read-only query and return a pandas DataFrame."""
    sql = _add_settings(sql)
    result = _get_client().query(sql)
    return pd.DataFrame(result.result_rows, columns=result.column_names)


def _add_settings(sql: str) -> str:
    sql = sql.strip().rstrip(";")
    if "max_execution_time" not in sql.lower():
        sql += "\nSETTINGS max_execution_time = 30"
    return sql
