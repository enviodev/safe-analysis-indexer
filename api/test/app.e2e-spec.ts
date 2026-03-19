import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('API (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  it('/api/v1/about (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/about')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('name', 'safe-envio-api');
        expect(res.body).toHaveProperty('version');
      });
  });
});
