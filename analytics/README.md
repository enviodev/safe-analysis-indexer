# safe-analytics

Agent-native BI for the Safe indexer. Ask Claude Code questions about the
ClickHouse sink populated by `envio dev` and get SQL-backed answers.

## Setup

```bash
uv sync
cp .env.example .env  # defaults point at the local docker-compose ClickHouse
```

ClickHouse must be up — from the repo root:

```bash
docker compose up -d
```

## Usage

Open this folder in Claude Code and ask questions, for example:

- "How many Safes have we discovered per chain?"
- "Top 20 tokens moving through Safes in the last week"
- "Which Safes hold the most distinct tokens?"
- "Who are the most prolific Safe owners?"
- "Plot the daily ERC20 transfer count"

Claude reads `CLAUDE.md`, finds the right query from `queries/`, runs it against
ClickHouse, and optionally charts the result.

## Structure

```
lib/          # ClickHouse connector, filter fragments, charting helpers
queries/      # Saved parametrized .sql queries, grouped by domain
scripts/      # Weekly snapshot generator
snapshots/    # Git-committed JSON snapshots for trending
output/       # Generated charts (gitignored)
CLAUDE.md     # Schema reference + query index for the agent
```

## Weekly snapshot

```bash
uv run python scripts/snapshot.py
```
