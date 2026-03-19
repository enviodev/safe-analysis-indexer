import { z } from 'zod';
import { chainIdSchema } from '@/common/schemas/common.schemas';

/** DB row from Safe join (validate at edge) */
export const ownerSafeRowSchema = z.object({
  address: z.string(),
  owners: z.array(z.string()),
  threshold: z.number(),
  nonce: z.number(),
  masterCopy: z.string().nullable(),
  version: z.string(),
});

export type OwnerSafeRow = z.infer<typeof ownerSafeRowSchema>;

export const ownerSafeItemSchema = z.object({
  address: z.string(),
  owners: z.array(z.string()),
  threshold: z.number(),
  nonce: z.number(),
  masterCopy: z.string().nullable(),
  fallbackHandler: z.string().nullable(),
  guard: z.string().nullable(),
  moduleGuard: z.string().nullable(),
  enabledModules: z.array(z.string()),
});

export type OwnerSafeItem = z.infer<typeof ownerSafeItemSchema>;

export const ownerSafesResponseSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ownerSafeItemSchema),
});

export type OwnerSafesResponse = z.infer<typeof ownerSafesResponseSchema>;

/** Query for GET /owners/:ownerAddress/safes - chainId required */
export const getOwnerSafesQuerySchema = z.object({
  chainId: chainIdSchema,
});

export type GetOwnerSafesQuery = z.infer<typeof getOwnerSafesQuerySchema>;
