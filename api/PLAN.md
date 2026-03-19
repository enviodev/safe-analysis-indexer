# Safe Transaction Service–compatible API (Envio multichain)

## Goal

Add a new **API layer** in this repo that mimics the [Safe Transaction Service](https://github.com/safe-global/safe-transaction-service) REST API, but backed by **Envio’s PostgreSQL** indexer. The indexer is **multichain** (one DB, many `chainId`s), so the API must expose chain-aware endpoints.

## Multichain design

- **Safe Transaction Service**: one deployment per chain (e.g. `api.safe.global/tx-service/eth/`); chain is implicit in the base URL.
- **This API**: single deployment, one DB with `Safe.chainId` and `envio_chains.id` = chain id.

**Proposed approach: chain in the path**

- All relevant resources are scoped by chain:
  - `GET /api/v1/chains/{chainId}/about/`
  - `GET /api/v1/chains/{chainId}/about/indexing/`
  - `GET /api/v1/chains/{chainId}/safes/{safeAddress}/`
  - `GET /api/v2/chains/{chainId}/owners/{ownerAddress}/safes/`
- **Benefits**: clear resource hierarchy, cache-friendly, aligns with “one chain = one logical service” while reusing one codebase and one DB.
- **Optional**: add a small **chain discovery** endpoint, e.g. `GET /api/v1/chains/` returning `[{ "chainId": 1 }, { "chainId": 137 }, ...]` from `envio_chains`, so clients can iterate.

**Alternatives considered**

- Query param `?chainId=1`: works but path-based is more RESTful and easier to reason about.
- Header `X-Chain-Id`: possible but less visible and harder to document/cache.

---

## Tech stack

| Item | Choice |
|------|--------|
| Runtime | Node (Yarn + Bun or Node) |
| Framework | **NestJS** (TypeScript) |
| DB | PostgreSQL, **no ORM** – raw SQL / `pg` client |
| Connection | `postgresql://postgres:testing@localhost:5433/envio-dev` (from `.cursor/mcp.json`) |
| HTTP logging | **Pino** (e.g. `nestjs-pino`) |

---

## Repo layout

- New folder: **`api/`** at repo root (sibling to `src/`, `explorer/`, etc.).
- `api/` is a self-contained NestJS app: its own `package.json`, `tsconfig.json`, and scripts (`yarn install`, `yarn build`, `yarn start:dev`).

---

## Database usage

- **Schema**: `public`.
- **Tables used**:
  - `envio_chains` – indexing state per chain (`id` = chain id, `progress_block`, `ready_at`, etc.).
  - `"Safe"` – Safe wallets (`id` = `{chainId}-{address}`, `chainId`, `address`, `owners`, `threshold`, `nonce`, `masterCopy`, `version`, …).
  - `"SafeOwner"` – join table (`owner_id`, `safe_id` → `"Safe"`).

No ORM: use `pg` (or NestJS `@nestjs/typeorm` with `typeorm` in raw-query-only mode if you prefer; the plan assumes **raw `pg`** for clarity).

---

## Endpoints (first slice)

### 1. `GET /api/v1/about/` (or per-chain: `GET /api/v1/chains/{chainId}/about/`)

- **Purpose**: Basic service info (compatibility with Safe Transaction Service “about”).
- **Implementation**: Static or minimal config for now (e.g. name, version, “envio-backed”).

### 2. `GET /api/v1/about/indexing/` (or `GET /api/v1/chains/{chainId}/about/indexing/`)

- **Purpose**: Indexing status for the chain (only master-copy indexing; no ERC20 or other pipelines).
- **Source**: `envio_chains` where `id = :chainId`.
- **Response shape** (per chain):

```json
{
  "currentBlockNumber": 24690775,
  "currentBlockTimestamp": "2026-03-19T09:56:11Z",
  "erc20BlockNumber": 24690775,
  "erc20BlockTimestamp": "2026-03-19T09:56:11Z",
  "erc20Synced": true,
  "masterCopiesBlockNumber": 24690775,
  "masterCopiesBlockTimestamp": "2026-03-19T09:56:11Z",
  "masterCopiesSynced": true,
  "synced": true
}
```

- **Mapping**:
  - `currentBlockNumber` / `masterCopiesBlockNumber` ← `progress_block`.
  - `currentBlockTimestamp` / `masterCopiesBlockTimestamp` ← from `ready_at` or derived (if we have block→time elsewhere; else same as block number for now or leave as ISO string from `ready_at`).
  - We **only** support master-copy indexing: `erc20Synced` and `erc20Block*` can be set equal to master-copy values (or “synced”) for compatibility; `synced` = “master copy synced” for that chain.

### 3. `GET /api/v1/safes/{safeAddress}/` (or `GET /api/v1/chains/{chainId}/safes/{safeAddress}/`)

- **Purpose**: Safe details (Safe Transaction Service compatible).
- **Source**: `"Safe"` where `address = :safeAddress` (and optionally `chainId = :chainId` if path includes chain).
- **Response shape**:

```json
{
  "address": "0xFF040F7ffaF177b638E050E4E1de03b201bA0d1C",
  "nonce": "38",
  "threshold": 2,
  "owners": ["0x...", "0x...", "0x..."],
  "masterCopy": "0xfb1bffC9d739B8D520DaF37dF666da4C687191EA",
  "modules": [],
  "fallbackHandler": "0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4",
  "guard": "0x0000000000000000000000000000000000000000",
  "moduleGuard": "0x0000000000000000000000000000000000000000",
  "version": "1.3.0+L2"
}
```

- **Mapping**:
  - `address`, `nonce` (string), `threshold`, `owners`, `masterCopy` ← from `"Safe"`.
  - `version`: map internal enum (e.g. `V1_3_0`) to display string (e.g. `1.3.0+L2` / `1.3.0`) using existing version/L2 logic (e.g. from `consts.ts` / `isL1Safe`).
  - `modules`, `fallbackHandler`, `guard`, `moduleGuard`: **not** in current Envio schema; return `[]` and zero-address or `null` for now unless we add them later.

### 4. `GET /api/v2/owners/{ownerAddress}/safes/` (or `GET /api/v2/chains/{chainId}/owners/{ownerAddress}/safes/`)

- **Purpose**: List Safes for an owner (Safe Transaction Service v2 compatible).
- **Source**: `"SafeOwner"` joined with `"Safe"` on `safe_id = "Safe".id`, filter by `owner_id = :ownerAddress` (and optionally `"Safe".chainId = :chainId`).
- **Response shape**:

```json
{
  "count": 1,
  "next": null,
  "previous": null,
  "results": [
    {
      "address": "0xFF04...",
      "owners": ["0x...", "0x..."],
      "threshold": 2,
      "nonce": 38,
      "masterCopy": "0xfb1bff...",
      "fallbackHandler": null,
      "guard": null,
      "moduleGuard": null,
      "enabledModules": []
    }
  ]
}
```

- **Mapping**: From `"Safe"` + join; `enabledModules` = `[]`; guards/fallback null if not in DB.

---

## Implementation order

1. **Branch**: Create a feature branch (e.g. `feat/safe-tx-service-api`).
2. **Scaffold**: Add `api/` with NestJS, `pg`, pino (e.g. `nestjs-pino`), no ORM.
3. **Config**: DB connection from env (e.g. `DATABASE_URI`), defaulting to `postgresql://postgres:testing@localhost:5433/envio-dev`.
4. **Global prefix**: Set `api` as global prefix (so routes are under `/api/...`).
5. **Chains**: Optional `GET /api/v1/chains` returning list of chain ids from `envio_chains`.
6. **Endpoints**:
   - Implement `GET /api/v1/about/` (and optionally `GET /api/v1/chains/{chainId}/about/`).
   - Implement `GET /api/v1/about/indexing/` (per chain from `envio_chains`).
   - Implement `GET /api/v1/chains/{chainId}/safes/{safeAddress}/` (from `"Safe"`).
   - Implement `GET /api/v2/chains/{chainId}/owners/{ownerAddress}/safes/` (from `"SafeOwner"` + `"Safe"`).
7. **Version formatting**: Shared helper to map `Safe.version` enum → `"1.3.0"` / `"1.3.0+L2"` (reuse or mirror `consts.ts` logic).
8. **Logging**: Ensure every HTTP request is logged with pino (method, url, status, duration).

---

## What else is needed (open points)

- **Block timestamp**: `envio_chains` has `ready_at`; if we need “current block timestamp”, we may need to derive from block number via an external RPC or leave it from `ready_at` / same as last event time. For MVP, using `ready_at` or a placeholder is fine.
- **Pagination**: For `GET /api/v2/.../owners/{owner}/safes/`, add `limit`/`offset` (or cursor) and set `next`/`previous` accordingly.
- **Validation**: Validate `chainId` (exists in `envio_chains`), `safeAddress` and `ownerAddress` (Ethereum address format).
- **404**: Return 404 when chain not found, safe not found, or owner has no safes (or empty `results`).
- **Tests**: Unit tests for mappers (version, indexing payload); integration tests for endpoints with a test DB or mocks.
- **Docs**: OpenAPI/Swagger for the new routes (optional but recommended).

Once this plan is agreed, the next step is to create the branch and the `api/` NestJS app with the above endpoints and multichain path design.

---

## Implemented (feat/safe-tx-service-api)

- **Branch**: `feat/safe-tx-service-api`
- **Location**: `api/` – NestJS app, raw `pg`, Pino HTTP logging, global prefix `api`.
- **Multichain**: Supported via:
  - **Query**: `?chainId=1` for `GET /api/v1/about/indexing`, `GET /api/v1/safes/:address`, `GET /api/v2/owners/:ownerAddress/safes`.
  - **Path**: `GET /api/v1/chains/:chainId/about/indexing`, `GET /api/v1/chains/:chainId/safes/:address`, `GET /api/v2/chains/:chainId/owners/:ownerAddress/safes`.
- **Chain discovery**: `GET /api/v1/chains` returns `[{ "chainId": 1 }, ...]` from `envio_chains`.
- **Indexing**: `GET /api/v1/about/indexing` without `chainId` uses the first chain in `envio_chains`.
- **Run**: From repo root, `pnpm --filter api run start:dev` or `cd api && pnpm run start:dev`. Set `DATABASE_URI` or use default `postgresql://postgres:testing@localhost:5433/envio-dev`.
