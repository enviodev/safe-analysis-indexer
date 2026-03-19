import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@/infrastructure/database/database.service';
import { ownerSafeRowSchema } from './schemas/owners.schemas';
import type {
  OwnerSafeRow,
  OwnerSafeItem,
  OwnerSafesResponse,
} from './schemas/owners.schemas';

@Injectable()
export class OwnersService {
  constructor(private readonly db: DatabaseService) {}

  async getSafesForOwner(
    chainId: number,
    ownerAddress: string,
  ): Promise<OwnerSafesResponse> {
    const rows = await this.db.query(
      `SELECT s.address, s.owners, s.threshold, s.nonce, s."masterCopy", s.version
       FROM "SafeOwner" so
       JOIN "Safe" s ON s.id = so.safe_id
       WHERE LOWER(so.owner_id) = LOWER($1) AND s."chainId" = $2
       ORDER BY s.address`,
      [ownerAddress, chainId],
      ownerSafeRowSchema,
    );

    const results: OwnerSafeItem[] = rows.map((row: OwnerSafeRow) => ({
      address: row.address,
      owners: row.owners ?? [],
      threshold: row.threshold,
      nonce: row.nonce,
      masterCopy: row.masterCopy,
      fallbackHandler: null,
      guard: null,
      moduleGuard: null,
      enabledModules: [],
    }));

    return {
      count: results.length,
      next: null,
      previous: null,
      results,
    };
  }
}
