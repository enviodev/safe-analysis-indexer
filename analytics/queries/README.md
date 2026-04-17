# Query index

All queries are parametrised with `{{name}}` placeholders. Defaults are in
each file's header comment. Read `../CLAUDE.md` for the schema and workflow.

## safes/

| File | What it answers |
|---|---|
| `safes_per_chain.sql` | Distribution of Safes across chains |
| `safes_created_daily.sql` | New Safes per day for a chain |
| `most_active_safes.sql` | Top Safes by successful execution count |
| `safe_profile.sql` | Everything we know about a specific Safe |

## versions/

| File | What it answers |
|---|---|
| `version_distribution.sql` | How many Safes are on each version |

## transfers/

| File | What it answers |
|---|---|
| `transfers_daily.sql` | Daily ERC20 Transfer event counts |
| `top_tokens.sql` | Top tokens by transfer count (any recipient) |
| `top_tokens_for_safes.sql` | Top tokens where a Safe is sender or receiver |
| `safes_by_token_diversity.sql` | Safes touching the most distinct tokens |
| `safe_flow_breakdown.sql` | Inbound vs outbound transfer counts per token for one Safe |
| `safe_transfers.sql` | Raw list of every ERC20 transfer touching one Safe |

## owners/

| File | What it answers |
|---|---|
| `top_owners.sql` | Owners controlling the most Safes |
| `owner_safe_fanout.sql` | Distribution of Safes-per-owner |
