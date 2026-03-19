import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { IncomingMessage } from 'node:http';
import type { ServerResponse } from 'node:http';
import { ConfigModule } from '@/infrastructure/config/config.module';
import { BlockchainModule } from '@/infrastructure/blockchain/blockchain.module';
import { DatabaseModule } from '@/infrastructure/database/database.module';
import { AboutModule } from '@/modules/about/about.module';
import { ChainsModule } from '@/modules/chains/chains.module';
import { SafesModule } from '@/modules/safes/safes.module';
import { OwnersModule } from '@/modules/owners/owners.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level:
          (process.env.NODE_ENV ?? 'development') !== 'production'
            ? 'debug'
            : 'info',
        transport:
          (process.env.NODE_ENV ?? 'development') !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
        serializers: {
          req: (req: IncomingMessage) => ({
            method: req.method,
            url: req.url,
          }),
          res: (res: ServerResponse) => ({
            statusCode: res.statusCode,
          }),
        },
      },
    }),
    DatabaseModule,
    BlockchainModule,
    AboutModule,
    ChainsModule,
    SafesModule,
    OwnersModule,
  ],
})
export class AppModule {}
