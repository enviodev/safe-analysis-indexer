import { Injectable, NotFoundException } from '@nestjs/common';
import { BlockchainService } from '../../infrastructure/blockchain/blockchain.service';
import { DatabaseService } from '../../infrastructure/database/database.service';
import {
  envioChainIdRowSchema,
  envioChainRowSchema,
} from './schemas/about.schemas';
import type { AboutResponse, IndexingResponse } from './schemas/about.schemas';

@Injectable()
export class AboutService {
  constructor(
    private readonly db: DatabaseService,
    private readonly blockchain: BlockchainService,
  ) {}

  getAbout(): AboutResponse {
    return {
      name: 'safe-envio-api',
      version: '0.1.0',
      api: 'Safe Transaction Service compatible API backed by Envio indexer',
    };
  }

  async getIndexing(chainId: number | null): Promise<IndexingResponse> {
    if (chainId == null) {
      const first = await this.db.queryOne(
        'SELECT id FROM envio_chains ORDER BY id LIMIT 1',
        [],
        envioChainIdRowSchema,
      );
      if (!first) {
        throw new NotFoundException('No chain indexing data found');
      }
      chainId = first.id;
    }

    const row = await this.db.queryOne(
      'SELECT id, progress_block, ready_at, source_block FROM envio_chains WHERE id = $1',
      [chainId],
      envioChainRowSchema,
    );

    if (!row) {
      throw new NotFoundException(`Chain ${chainId} not found`);
    }

    const fallbackTimestamp = row.ready_at?.toISOString() ?? null;

    // When RPC is configured, use chain head as currentBlockNumber; otherwise use source_block
    const chainHead = await this.blockchain.getBlockNumber(chainId);
    const currentBlockNumber = chainHead ?? row.source_block;
    const masterCopiesBlockNumber = row.progress_block;

    // Use blockTag 'latest' for current block (more reliable); getBlock(blockNumber) for indexed block
    const [currentBlockTimestamp, masterCopiesBlockTimestamp] =
      await Promise.all([
        chainHead != null
          ? this.blockchain.getLatestBlockTimestamp(chainId)
          : this.blockchain.getBlockTimestamp(chainId, currentBlockNumber),
        this.blockchain.getBlockTimestamp(chainId, masterCopiesBlockNumber),
      ]);

    // Synced when we have indexed up to or past the chain head
    const synced = masterCopiesBlockNumber >= currentBlockNumber;

    return {
      currentBlockNumber,
      currentBlockTimestamp: currentBlockTimestamp ?? fallbackTimestamp,
      erc20BlockNumber: null,
      erc20BlockTimestamp: null,
      erc20Synced: null,
      masterCopiesBlockNumber,
      masterCopiesBlockTimestamp:
        masterCopiesBlockTimestamp ??
        fallbackTimestamp ??
        currentBlockTimestamp,
      masterCopiesSynced: synced,
      synced,
    };
  }
}
