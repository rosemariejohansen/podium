import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { REDIS } from '../src/redis/redis.module.js';
import { createTestApp } from './helpers/app.js';

describe('GET /health/ready (e2e)', () => {
  let app: NestExpressApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('is ready when Postgres and Redis respond', async () => {
    app = await createTestApp();
    const res = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(res.body).toEqual({ status: 'ready', database: 'up', redis: 'up' });
  });

  it('returns 503 SERVICE_UNAVAILABLE naming the failed dependency', async () => {
    app = await createTestApp((b) =>
      b
        .overrideProvider(REDIS)
        .useValue({ ping: () => Promise.reject(new Error('down')), quit: async () => 'OK' }),
    );
    const res = await request(app.getHttpServer()).get('/health/ready').expect(503);
    expect(res.body.error).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      details: { database: 'up', redis: 'down' },
    });
  });
});
