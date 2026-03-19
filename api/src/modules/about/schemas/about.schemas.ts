import { z } from 'zod';
import { chainIdSchema } from '@/common/schemas/common.schemas';

// ----- DB row schemas (validate at edge) -----

export const envioChainIdRowSchema = z.object({
  id: z.number(),
});

export const envioChainRowSchema = z.object({
  id: z.number(),
  progress_block: z.number(),
  ready_at: z.date().nullable(),
  source_block: z.number(),
});

export type EnvioChainIdRow = z.infer<typeof envioChainIdRowSchema>;
export type EnvioChainRow = z.infer<typeof envioChainRowSchema>;

// ----- Response types & schemas -----

export const aboutResponseSchema = z.object({
  name: z.string(),
  version: z.string(),
  api: z.string(),
});

export type AboutResponse = z.infer<typeof aboutResponseSchema>;

export const indexingResponseSchema = z.object({
  currentBlockNumber: z.number(),
  currentBlockTimestamp: z.string().nullable(),
  erc20BlockNumber: z.number().nullable(),
  erc20BlockTimestamp: z.string().nullable(),
  erc20Synced: z.boolean().nullable(),
  masterCopiesBlockNumber: z.number(),
  masterCopiesBlockTimestamp: z.string().nullable(),
  masterCopiesSynced: z.boolean(),
  synced: z.boolean(),
});

export type IndexingResponse = z.infer<typeof indexingResponseSchema>;

// ----- Query schemas -----

/** Optional chainId for GET /about/indexing (defaults to first chain when omitted) */
export const indexingQuerySchema = z.object({
  chainId: chainIdSchema.optional().nullable(),
});

export type IndexingQuery = z.infer<typeof indexingQuerySchema>;
