import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';
import type { z } from 'zod';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private pool: Pool;

  constructor(private readonly configService: ConfigService) {
    const connectionString =
      this.configService.getOrThrow<string>('DATABASE_URI');
    this.pool = new Pool({ connectionString });
  }

  /** Query without schema: returns unvalidated rows (cast by caller). */
  async query<T = unknown>(text: string, values?: unknown[]): Promise<T[]>;
  /** Query with schema: validates each row and returns typed result. */
  async query<Schema extends z.ZodTypeAny>(
    text: string,
    values: unknown[] | undefined,
    schema: Schema,
  ): Promise<z.infer<Schema>[]>;
  async query<Schema extends z.ZodTypeAny>(
    text: string,
    values?: unknown[],
    schema?: Schema,
  ): Promise<unknown[] | z.infer<Schema>[]> {
    const result = await this.pool.query(text, values);
    const rows = (result.rows ?? []) as unknown[];
    if (schema) {
      return rows.map((row) => schema.parse(row) as z.infer<Schema>);
    }
    return rows;
  }

  /** Query one row without schema. */
  async queryOne<T = unknown>(
    text: string,
    values?: unknown[],
  ): Promise<T | null>;
  /** Query one row with schema: validates and returns typed result. */
  async queryOne<Schema extends z.ZodTypeAny>(
    text: string,
    values: unknown[] | undefined,
    schema: Schema,
  ): Promise<z.infer<Schema> | null>;
  async queryOne<Schema extends z.ZodTypeAny>(
    text: string,
    values?: unknown[],
    schema?: Schema,
  ): Promise<z.infer<Schema> | null> {
    if (schema) {
      const rows = await this.query(text, values, schema);
      return rows[0] ?? null;
    }
    const rows = await this.query(text, values);
    return (rows[0] ?? null) as z.infer<Schema> | null;
  }

  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
