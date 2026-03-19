import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@/infrastructure/database/database.service';
import { chainIdRowSchema } from './schemas/chains.schemas';
import type { ChainsResponse } from './schemas/chains.schemas';

@Injectable()
export class ChainsService {
  constructor(private readonly db: DatabaseService) {}

  async listChains(): Promise<ChainsResponse> {
    const rows = await this.db.query(
      'SELECT id FROM envio_chains ORDER BY id',
      [],
      chainIdRowSchema,
    );
    return rows.map((r) => ({ chainId: r.id }));
  }
}
