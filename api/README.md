# Safe Envio API

NestJS API that mimics the [Safe Transaction Service](https://github.com/safe-global/safe-transaction-service) REST API, backed by Envio’s PostgreSQL indexer (multichain).

## Setup

From repo root (pnpm workspace):

```bash
pnpm install
```

Or from this directory:

```bash
pnpm install
```

Copy `.env.example` to `.env` and set `DATABASE_URI` if needed (default: `postgresql://postgres:testing@localhost:5433/envio-dev`).

**Blockchain / timestamps** (indexing endpoint): Set `RPC_URL_<chainId>` (e.g. `RPC_URL_1`, `RPC_URL_137`) so the API can use viem to fetch chain head and block timestamps. If unset, the API uses `envio_chains.ready_at` or `null`.

## Run

```bash
pnpm run start:dev
```

Server listens on `http://localhost:4000` (or `PORT` from env). All routes are under the `/api` prefix.

**Swagger UI**: [http://localhost:4000/api-docs](http://localhost:4000/api-docs)

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/about` | Service info |
| GET | `/api/v1/about/indexing` | Indexing status (optional `?chainId=1`; defaults to first chain) |
| GET | `/api/v1/chains` | List chain IDs from `envio_chains` |
| GET | `/api/v1/safes/:address` | Safe details (required `?chainId=1`) |
| GET | `/api/v2/owners/:ownerAddress/safes` | Safes for an owner (required `?chainId=1`) |

## Structure (DDD)

- **`infrastructure/database`** – PostgreSQL connection and raw query service (`pg`, no ORM).
- **`infrastructure/config`** – Loads `.env` (via `@nestjs/config`), validates with Zod, and provides `ConfigService` (and `rpcUrlsByChain` from `RPC_URL_<chainId>`).
- **`infrastructure/blockchain`** – RPC access via viem using config (`rpcUrlsByChain`).
- **`modules/about`**, **`modules/chains`**, **`modules/safes`**, **`modules/owners`** – Feature modules; each can have `schemas/` (Zod schemas + types), controller, and service.
- **`common/schemas`** – Shared Zod schemas (e.g. `chainId`, Ethereum `address`). **`common/pipes`** – `ZodValidationPipe` for request validation.
- **`utils`** – Pure helpers (e.g. version mapper).

## Tech

- **NestJS** (TypeScript)
- **PostgreSQL** via `pg` (no ORM)
- **Zod** for validation and type-safe schemas (types inferred from schemas)
- **Swagger/OpenAPI** at `/api-docs` for interactive API docs
- **Pino** for HTTP logging

See [../PLAN.md](../PLAN.md) for the full design and multichain approach.
