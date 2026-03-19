import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicClient, defineChain, type Chain, http } from 'viem';

/**
 * Blockchain RPC access via viem. RPC URLs come from validated config (RPC_URL_<chainId> in .env).
 */
@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);
  private readonly rpcByChain: Map<number, string>;
  private readonly clientByChain = new Map<
    number,
    ReturnType<typeof createPublicClient>
  >();

  constructor(private readonly configService: ConfigService) {
    const rpcUrlsByChain =
      this.configService.get<Record<string, string>>('rpcUrlsByChain') ?? {};
    this.rpcByChain = new Map(
      Object.entries(rpcUrlsByChain).map(([chainIdStr, url]) => [
        parseInt(chainIdStr, 10),
        url,
      ]),
    );
    if (this.rpcByChain.size > 0) {
      this.logger.log(
        `RPC URLs loaded for chains: ${[...this.rpcByChain.keys()].sort((a, b) => a - b).join(', ')}`,
      );
    } else {
      this.logger.warn(
        'No RPC_URL_<chainId> in config — indexing timestamps will be null. Set e.g. RPC_URL_1 in .env',
      );
    }
  }

  private getClient(
    chainId: number,
  ): ReturnType<typeof createPublicClient> | null {
    const url = this.rpcByChain.get(chainId);
    if (!url) {
      return null;
    }
    let client = this.clientByChain.get(chainId);
    if (!client) {
      const chain: Chain = defineChain({
        id: chainId,
        name: `Chain ${chainId}`,
        nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' },
        rpcUrls: { default: { http: [url] } },
      });
      client = createPublicClient({
        chain,
        transport: http(url, { timeout: 5_000 }),
      });
      this.clientByChain.set(chainId, client);
    }
    return client;
  }

  /**
   * Returns current chain block number (head), or null if no RPC or request fails.
   */
  async getBlockNumber(chainId: number): Promise<number | null> {
    const client = this.getClient(chainId);
    if (!client) {
      return null;
    }
    try {
      const blockNumber = await client.getBlockNumber();
      return Number(blockNumber);
    } catch {
      return null;
    }
  }

  /**
   * Returns ISO timestamp for the latest block (chain head). Use when currentBlockNumber is the head.
   */
  async getLatestBlockTimestamp(chainId: number): Promise<string | null> {
    const client = this.getClient(chainId);
    if (!client) {
      return null;
    }
    try {
      const block = await client.getBlock({ blockTag: 'latest' });
      return this.blockTimestampToIso(block);
    } catch (err) {
      this.logger.warn(
        `getBlock(blockTag: 'latest') failed for chain ${chainId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /**
   * Returns ISO timestamp for the given block number, or null if no RPC configured or request fails.
   */
  async getBlockTimestamp(
    chainId: number,
    blockNumber: number,
  ): Promise<string | null> {
    const client = this.getClient(chainId);
    if (!client) {
      return null;
    }
    try {
      const block = await client.getBlock({
        blockNumber: BigInt(blockNumber),
      });
      return this.blockTimestampToIso(block);
    } catch (err) {
      this.logger.warn(
        `getBlock(blockNumber: ${blockNumber}) failed for chain ${chainId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private blockTimestampToIso(
    block: { timestamp?: bigint | number | string } | null | undefined,
  ): string | null {
    const ts = block?.timestamp;
    if (ts == null) {
      return null;
    }
    const seconds =
      typeof ts === 'bigint'
        ? Number(ts)
        : typeof ts === 'string'
          ? ts.startsWith('0x')
            ? parseInt(ts, 16)
            : parseInt(ts, 10)
          : Number(ts);
    if (!Number.isFinite(seconds)) {
      return null;
    }
    return new Date(seconds * 1000).toISOString();
  }
}
