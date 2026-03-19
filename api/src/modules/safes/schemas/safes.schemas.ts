import { z } from 'zod';
import { chainIdSchema } from '@/common/schemas/common.schemas';

/** DB row from "Safe" table (validate at edge) */
export const safeRowSchema = z.object({
  address: z.string(),
  chainId: z.number(),
  nonce: z.number(),
  threshold: z.number(),
  owners: z.array(z.string()),
  masterCopy: z.string().nullable(),
  version: z.string(),
});

export type SafeRow = z.infer<typeof safeRowSchema>;

/** DB row for GET /safes/:address/creation (subset of "Safe") */
export const safeCreationRowSchema = z.object({
  creationTxHash: z.string(),
  creationTimestamp: z.union([z.number(), z.string(), z.bigint()]),
  initializer: z.string(),
  initiator: z.string(),
  masterCopy: z.string().nullable(),
});

export type SafeCreationRow = z.infer<typeof safeCreationRowSchema>;

export const safeCreationResponseSchema = z.object({
  created: z.string().nullable(),
  creator: z.string().nullable(),
  transactionHash: z.string().nullable(),
  factoryAddress: z.string().nullable(),
  masterCopy: z.string().nullable(),
  setupData: z.string().nullable(),
  saltNonce: z.string().nullable(),
  dataDecoded: z.unknown().nullable(),
  userOperation: z.unknown().nullable(),
});

export type SafeCreationResponse = z.infer<typeof safeCreationResponseSchema>;

export const safeDetailResponseSchema = z.object({
  address: z.string(),
  nonce: z.string(),
  threshold: z.number(),
  owners: z.array(z.string()),
  masterCopy: z.string().nullable(),
  modules: z.array(z.string()),
  fallbackHandler: z.string().nullable(),
  guard: z.string().nullable(),
  moduleGuard: z.string().nullable(),
  version: z.string(),
});

export type SafeDetailResponse = z.infer<typeof safeDetailResponseSchema>;

/** Query for GET /safes/:address - chainId required */
export const getSafeQuerySchema = z.object({
  chainId: chainIdSchema,
});

export type GetSafeQuery = z.infer<typeof getSafeQuerySchema>;

/** Query for GET /v2/safes/:safeAddr/multisig-transactions */
export const getMultisigTransactionsQuerySchema = z.object({
  chainId: chainIdSchema,
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type GetMultisigTransactionsQuery = z.infer<
  typeof getMultisigTransactionsQuerySchema
>;

/** Query for GET /v2/multisig-transactions/:safeTxHash - chainId optional */
export const getMultisigTransactionQuerySchema = z.object({
  chainId: chainIdSchema.optional(),
});

export type GetMultisigTransactionQuery = z.infer<
  typeof getMultisigTransactionQuerySchema
>;

/** DB row from "SafeTransaction" table (BigInt columns may come as string from pg) */
export const safeTransactionRowSchema = z.object({
  id: z.string(),
  safe_id: z.string(),
  chainId: z.number(),
  to: z.string(),
  value: z.union([z.number(), z.string(), z.bigint()]),
  data: z.string(),
  operation: z.union([z.number(), z.string(), z.bigint()]),
  safeTxGas: z.union([z.number(), z.string(), z.bigint()]).optional(),
  baseGas: z.union([z.number(), z.string(), z.bigint()]).optional(),
  gasPrice: z.union([z.number(), z.string(), z.bigint()]).optional(),
  gasToken: z.string(),
  refundReceiver: z.string(),
  signatures: z.string(),
  nonce: z.union([z.number(), z.string(), z.bigint()]),
  msgSender: z.string(),
  threshold: z.number(),
  executionDate: z.union([z.number(), z.string(), z.bigint()]),
  txHash: z.string(),
});

export type SafeTransactionRow = z.infer<typeof safeTransactionRowSchema>;

/** DB row when joining SafeTransaction with Safe (for single-tx by hash) */
export const safeTransactionWithSafeRowSchema = safeTransactionRowSchema.extend(
  {
    safe_address: z.string(),
  },
);

export type SafeTransactionWithSafeRow = z.infer<
  typeof safeTransactionWithSafeRowSchema
>;

/** One multisig transaction in API response (STS-compatible; unmapped fields null) */
export const multisigTransactionItemSchema = z.object({
  safe: z.string(),
  to: z.string(),
  value: z.string(),
  data: z.string().nullable(),
  operation: z.number(),
  gasToken: z.string(),
  safeTxGas: z.string(),
  baseGas: z.string(),
  gasPrice: z.string(),
  refundReceiver: z.string(),
  nonce: z.string(),
  executionDate: z.string(),
  submissionDate: z.string().nullable(),
  modified: z.string().nullable(),
  blockNumber: z.number().nullable(),
  transactionHash: z.string(),
  safeTxHash: z.string().nullable(),
  proposer: z.string().nullable(),
  proposedByDelegate: z.string().nullable(),
  executor: z.string().nullable(),
  isExecuted: z.boolean(),
  isSuccessful: z.boolean().nullable(),
  ethGasPrice: z.string().nullable(),
  maxFeePerGas: z.string().nullable(),
  maxPriorityFeePerGas: z.string().nullable(),
  gasUsed: z.number().nullable(),
  fee: z.string().nullable(),
  origin: z.string().nullable(),
  dataDecoded: z.unknown().nullable(),
  confirmationsRequired: z.number().nullable(),
  confirmations: z.array(z.unknown()).nullable(),
  trusted: z.boolean().nullable(),
  signatures: z.string(),
});

export type MultisigTransactionItem = z.infer<
  typeof multisigTransactionItemSchema
>;

export const multisigTransactionsResponseSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(multisigTransactionItemSchema),
  countUniqueNonce: z.number(),
});

export type MultisigTransactionsResponse = z.infer<
  typeof multisigTransactionsResponseSchema
>;
