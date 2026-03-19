import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validateConfig, configLoad } from './config.schema';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      // Try api/.env when running from repo root (e.g. pnpm --filter api run start:dev)
      envFilePath: ['.env.local', '.env', 'api/.env'],
      validate: validateConfig,
      load: [configLoad],
    }),
  ],
})
export class ConfigModule {}
