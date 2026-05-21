// Pure pricing math. No I/O, no envio types — easy to test in isolation.

const TWO_POW_192 = 2n ** 192n;
const SCALE = 10n ** 18n; // fixed-point scale we use for intermediate ratios

// Uniswap V3 sqrtPriceX96 → price of token0 in terms of token1, as a
// JS number. The on-chain encoding is `sqrt(token1/token0) * 2^96`, so
// the spot price (token1 per token0) is `(sqrtPriceX96^2) / 2^192`,
// then adjusted for decimals.
export function v3PriceToken1PerToken0(
  sqrtPriceX96: bigint,
  decimals0: number,
  decimals1: number,
): number {
  // Use bigint for the squaring + scale to avoid float overflow on large
  // sqrtPriceX96 values, then convert to number once we're inside JS-safe
  // magnitude.
  const ratioScaled = (sqrtPriceX96 * sqrtPriceX96 * SCALE) / TWO_POW_192;
  const ratio = Number(ratioScaled) / Number(SCALE);
  return ratio * 10 ** (decimals0 - decimals1);
}

// Helper: given a pool's sqrtPriceX96, return the price of `priceable` in
// units of `anchor`. If priceable == token0, this is token1-per-token0.
// Otherwise we invert.
export function v3PriceableInAnchor(
  sqrtPriceX96: bigint,
  token0: string,
  token1: string,
  decimals0: number,
  decimals1: number,
  priceableToken: string,
): number {
  const t1PerT0 = v3PriceToken1PerToken0(sqrtPriceX96, decimals0, decimals1);
  if (priceableToken.toLowerCase() === token0.toLowerCase()) {
    return t1PerT0; // anchor = token1, priceable = token0
  }
  if (priceableToken.toLowerCase() === token1.toLowerCase()) {
    return t1PerT0 === 0 ? 0 : 1 / t1PerT0; // anchor = token0, priceable = token1
  }
  throw new Error(
    `priceableToken ${priceableToken} not in pool {${token0}, ${token1}}`,
  );
}

// Uniswap V2 reserves → spot price of token0 in terms of token1.
// price = reserve1 / reserve0, decimals-adjusted.
export function v2PriceToken1PerToken0(
  reserve0: bigint,
  reserve1: bigint,
  decimals0: number,
  decimals1: number,
): number {
  if (reserve0 === 0n) return 0;
  // Pre-scale to keep precision when reserve1 is much smaller than reserve0.
  const ratioScaled = (reserve1 * SCALE) / reserve0;
  const ratio = Number(ratioScaled) / Number(SCALE);
  return ratio * 10 ** (decimals0 - decimals1);
}

export function v2PriceableInAnchor(
  reserve0: bigint,
  reserve1: bigint,
  token0: string,
  token1: string,
  decimals0: number,
  decimals1: number,
  priceableToken: string,
): number {
  const t1PerT0 = v2PriceToken1PerToken0(reserve0, reserve1, decimals0, decimals1);
  if (priceableToken.toLowerCase() === token0.toLowerCase()) {
    return t1PerT0;
  }
  if (priceableToken.toLowerCase() === token1.toLowerCase()) {
    return t1PerT0 === 0 ? 0 : 1 / t1PerT0;
  }
  throw new Error(
    `priceableToken ${priceableToken} not in pair {${token0}, ${token1}}`,
  );
}
