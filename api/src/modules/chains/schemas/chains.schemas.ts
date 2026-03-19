import { z } from 'zod';

/** DB row: envio_chains.id */
export const chainIdRowSchema = z.object({
  id: z.number(),
});

export type ChainIdRow = z.infer<typeof chainIdRowSchema>;

export const chainItemSchema = z.object({
  chainId: z.number(),
});

export type ChainItem = z.infer<typeof chainItemSchema>;

export const chainsResponseSchema = z.array(chainItemSchema);

export type ChainsResponse = z.infer<typeof chainsResponseSchema>;
