import { z } from 'zod';
import { isAddress } from 'viem';

/** Chain ID (positive integer, from path or query) */
export const chainIdSchema = z.coerce
  .number()
  .int({ message: 'chainId must be an integer' })
  .positive({ message: 'chainId must be positive' });

/** Ethereum address (validated via viem isAddress) */
export const addressSchema = z
  .string()
  .refine((val) => isAddress(val), { message: 'Invalid Ethereum address' });

/** Transaction hash (0x + 64 hex chars) */
export const txHashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, {
    message: 'Invalid transaction hash (0x + 64 hex)',
  });

export type ChainId = z.infer<typeof chainIdSchema>;
export type Address = z.infer<typeof addressSchema>;
export type TxHash = z.infer<typeof txHashSchema>;
