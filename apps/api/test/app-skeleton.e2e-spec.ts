import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app.js';

describe('API skeleton (e2e)', () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('GET /health is alive and carries a generated request id', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['x-request-id']).toMatch(/^req_[0-9a-f]{32}$/);
  });

  it('echoes a well-formed X-Request-Id and replaces a malformed one', async () => {
    const ok = await request(app.getHttpServer()).get('/health').set('X-Request-Id', 'abc_123');
    expect(ok.headers['x-request-id']).toBe('abc_123');
    const bad = await request(app.getHttpServer()).get('/health').set('X-Request-Id', 'bad id!');
    expect(bad.headers['x-request-id']).toMatch(/^req_/);
  });

  it('unknown route → 404 NOT_FOUND in the standard shape', async () => {
    const res = await request(app.getHttpServer()).get('/nope').expect(404);
    expect(res.body.error).toMatchObject({
      code: 'NOT_FOUND',
      requestId: res.headers['x-request-id'],
    });
  });

  it('malformed JSON → 400 VALIDATION_FAILED, not an HTML page', async () => {
    const res = await request(app.getHttpServer())
      .post('/internal/games')
      .set('Content-Type', 'application/json')
      .send('{"name":')
      .expect(400);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('oversized body → 413 PAYLOAD_TOO_LARGE (4 KB on /v1, 64 KB elsewhere)', async () => {
    const big = (n: number) => JSON.stringify({ pad: 'x'.repeat(n) });
    const post = (path: string, n: number) =>
      request(app.getHttpServer()).post(path).set('Content-Type', 'application/json').send(big(n));
    const v1 = await post('/v1/anything', 5_000).expect(413);
    expect(v1.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    const v1Upper = await post('/V1/anything', 5_000).expect(413);
    expect(v1Upper.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    await post('/v1/anything', 3_000).expect(404);
    await post('/internal/anything', 60_000).expect(404);
    await post('/internal/anything', 70_000).expect(413);
  });

  it('sends security headers and hides the framework', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('serves the OpenAPI document', async () => {
    const res = await request(app.getHttpServer()).get('/docs-json').expect(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.info.title).toBe('Podium API');
  });
});
