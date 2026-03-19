import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '@/infrastructure/database/database.service';
import { decodeSetupInitializer } from '@/utils/decode-safe-setup';
import { safeVersionToDisplay } from '@/utils/version-mapper';
import {
  safeRowSchema,
  safeCreationRowSchema,
  safeTransactionRowSchema,
  safeTransactionWithSafeRowSchema,
} from './schemas/safes.schemas';
import type {
  SafeRow,
  SafeDetailResponse,
  SafeCreationResponse,
  SafeTransactionRow,
  SafeTransactionWithSafeRow,
  MultisigTransactionItem,
  MultisigTransactionsResponse,
} from './schemas/safes.schemas';

function toBigIntString(v: number | string | bigint | undefined): string {
  if (v === undefined || v === null) return '0';
  if (typeof v === 'string') return v;
  if (typeof v === 'bigint') return String(v);
  return String(v);
}

function executionDateToIso(executionDate: number | string | bigint): string {
  const ts =
    typeof executionDate === 'string'
      ? Number(executionDate)
      : Number(executionDate);
  return new Date(ts * 1000).toISOString().replace(/\.000Z$/, 'Z');
}

/** Map DB row to API item. safeAddress = safe_id without chain (used as safeTxHash). */
function mapTransactionRowToItem(
  row: SafeTransactionRow,
  safeAddress: string,
): MultisigTransactionItem {
  return {
    safe: safeAddress,
    to: row.to,
    value: toBigIntString(row.value),
    data: row.data || null,
    operation: Number(row.operation),
    gasToken: row.gasToken ?? '0x0000000000000000000000000000000000000000',
    safeTxGas: toBigIntString(row.safeTxGas),
    baseGas: toBigIntString(row.baseGas),
    gasPrice: toBigIntString(row.gasPrice),
    refundReceiver:
      row.refundReceiver ?? '0x0000000000000000000000000000000000000000',
    nonce: toBigIntString(row.nonce),
    executionDate: executionDateToIso(row.executionDate),
    submissionDate: null,
    modified: null,
    blockNumber: null,
    transactionHash: row.txHash,
    safeTxHash: safeAddress,
    proposer: null,
    proposedByDelegate: null,
    executor: row.msgSender ?? null,
    isExecuted: true,
    isSuccessful: null,
    ethGasPrice: null,
    maxFeePerGas: null,
    maxPriorityFeePerGas: null,
    gasUsed: null,
    fee: null,
    origin: null,
    dataDecoded: null,
    confirmationsRequired: row.threshold ?? null,
    confirmations: null,
    trusted: null,
    signatures: row.signatures,
  };
}

@Injectable()
export class SafesService {
  constructor(private readonly db: DatabaseService) {}

  async getSafe(chainId: number, address: string): Promise<SafeDetailResponse> {
    const row: SafeRow | null = await this.db.queryOne(
      `SELECT address, "chainId", nonce, threshold, owners, "masterCopy", version
       FROM "Safe" WHERE "chainId" = $1 AND LOWER(address) = LOWER($2)`,
      [chainId, address],
      safeRowSchema,
    );

    if (!row) {
      throw new NotFoundException(
        `Safe ${address} on chain ${chainId} not found`,
      );
    }

    const versionDisplay = safeVersionToDisplay(row.version, row.masterCopy);

    return {
      address: row.address,
      nonce: String(row.nonce),
      threshold: row.threshold,
      owners: row.owners ?? [],
      masterCopy: row.masterCopy,
      modules: [],
      fallbackHandler: null,
      guard: '0x0000000000000000000000000000000000000000',
      moduleGuard: '0x0000000000000000000000000000000000000000',
      version: versionDisplay,
    };
  }

  async getSafeCreation(
    chainId: number,
    address: string,
  ): Promise<SafeCreationResponse> {
    const row = await this.db.queryOne(
      `SELECT "creationTxHash", "creationTimestamp", initializer, initiator, "masterCopy"
       FROM "Safe" WHERE "chainId" = $1 AND LOWER(address) = LOWER($2)`,
      [chainId, address],
      safeCreationRowSchema,
    );

    if (!row) {
      throw new NotFoundException(
        `Safe ${address} on chain ${chainId} not found`,
      );
    }

    const nonEmpty = (s: string | null | undefined): string | null => {
      const t = (s ?? '').trim();
      return t.length > 0 ? t : null;
    };

    const created =
      row.creationTimestamp !== undefined &&
      row.creationTimestamp !== null &&
      String(row.creationTimestamp) !== '0'
        ? executionDateToIso(row.creationTimestamp)
        : null;

    const initializer = nonEmpty(row.initializer);
    const dataDecoded = initializer
      ? decodeSetupInitializer(initializer)
      : null;

    return {
      created,
      creator: nonEmpty(row.initiator),
      transactionHash: nonEmpty(row.creationTxHash),
      factoryAddress: null,
      masterCopy: nonEmpty(row.masterCopy ?? undefined),
      setupData: initializer,
      saltNonce: null,
      dataDecoded,
      userOperation: null,
    };
  }

  async getMultisigTransactions(
    chainId: number,
    safeAddress: string,
    limit: number,
    offset: number,
  ): Promise<MultisigTransactionsResponse> {
    const safeId = `${chainId}-${safeAddress.toLowerCase()}`;

    const [countResult] = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM "SafeTransaction" WHERE safe_id = $1`,
      [safeId],
    );
    const count = countResult ? parseInt(countResult.count, 10) : 0;

    const rows = await this.db.query(
      `SELECT id, safe_id, "chainId", "to", value, data, operation,
              "safeTxGas", "baseGas", "gasPrice", "gasToken", "refundReceiver",
              signatures, nonce, "msgSender", threshold, "executionDate", "txHash"
       FROM "SafeTransaction"
       WHERE safe_id = $1
       ORDER BY "executionDate" DESC
       LIMIT $2 OFFSET $3`,
      [safeId, limit, offset],
      safeTransactionRowSchema,
    );

    const results: MultisigTransactionItem[] = rows.map(
      (row: SafeTransactionRow) => mapTransactionRowToItem(row, safeAddress),
    );

    return {
      count,
      next: null,
      previous: null,
      results,
      countUniqueNonce: count,
    };
  }

  async getMultisigTransactionByHash(
    txHash: string,
    chainId?: number,
  ): Promise<MultisigTransactionItem> {
    const rows = await this.db.query(
      `SELECT t.id, t.safe_id, t."chainId", t."to", t.value, t.data, t.operation,
              t."safeTxGas", t."baseGas", t."gasPrice", t."gasToken", t."refundReceiver",
              t.signatures, t.nonce, t."msgSender", t.threshold, t."executionDate", t."txHash",
              s.address AS safe_address
       FROM "SafeTransaction" t
       JOIN "Safe" s ON s.id = t.safe_id
       WHERE t."txHash" = $1
       ${chainId !== undefined ? 'AND t."chainId" = $2' : ''}
       LIMIT 1`,
      chainId !== undefined ? [txHash, chainId] : [txHash],
      safeTransactionWithSafeRowSchema,
    );

    const row = rows[0] as SafeTransactionWithSafeRow | undefined;
    if (!row) {
      throw new NotFoundException(
        chainId !== undefined
          ? `Multisig transaction ${txHash} on chain ${chainId} not found`
          : `Multisig transaction ${txHash} not found`,
      );
    }
    return mapTransactionRowToItem(row, row.safe_address);
  }
}
