import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '@/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('Safe Envio API')
    .setDescription(
      'Safe Transaction Service–compatible API backed by Envio indexer (multichain).',
    )
    .setVersion('0.1.0')
    .addTag('about', 'Service info and indexing status')
    .addTag('chains', 'Chain discovery')
    .addTag('safes', 'Safe wallet details')
    .addTag('owners', 'Safes by owner')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') ?? 4000;
  await app.listen(port);
}
void bootstrap();
