# Gnosis Safe Indexer

An Envio indexer that tracks Gnosis Safe contracts across multiple EVM chains.

## Supported Versions

- **Pre-1.3.0**: v1.0.0, v1.1.1, v1.2.0
- **v1.3.0**: Proxy factory with dynamic registration
- **v1.4.1**: Proxy factory with dynamic registration
- **v1.5.0**: Proxy factory with dynamic registration (Ethereum mainnet only)

## Supported Networks

see [config.yaml](./config.yaml)

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Generate types:

```bash
pnpm codegen
```

## Development

Run the indexer:

```bash
pnpm dev
```

## Project Structure

- `config.yaml` - Indexer configuration and contract definitions
- `schema.graphql` - GraphQL schema defining indexed entities
- `src/EventHandlers.ts` - Event handlers for Safe contracts
- `src/helpers.ts` - Helper functions for owner management
- `src/hypersync.ts` - HyperSync integration for trace data
- `src/consts.ts` - Chain ID to proxy address mappings

## Documentation

For more information about Envio indexers, visit [docs.envio.dev](https://docs.envio.dev).
