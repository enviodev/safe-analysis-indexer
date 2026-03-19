import { z } from 'zod';

const RPC_URL_PREFIX = 'RPC_URL_';

/** Build RPC map from config object (env vars loaded by Nest from .env). */
function buildRpcUrlsByChainFromConfig(
  config: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(config)) {
    if (
      key.startsWith(RPC_URL_PREFIX) &&
      typeof value === 'string' &&
      value.trim()
    ) {
      const chainId = key.slice(RPC_URL_PREFIX.length);
      if (/^\d+$/.test(chainId)) {
        out[chainId] = value.trim();
      }
    }
  }
  return out;
}

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URI: z
    .string()
    .min(1)
    .default('postgresql://postgres:testing@localhost:5433/envio-dev'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateConfig(
  config: Record<string, unknown>,
): EnvConfig & { rpcUrlsByChain: Record<string, string> } {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const msg = parsed.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join('; ');
    throw new Error(`Config validation failed: ${msg}`);
  }
  return {
    ...parsed.data,
    rpcUrlsByChain: buildRpcUrlsByChainFromConfig(config),
  };
}

export function configLoad(): { rpcUrlsByChain: Record<string, string> } {
  return {
    rpcUrlsByChain: buildRpcUrlsByChainFromConfig(
      process.env as Record<string, unknown>,
    ),
  };
}
