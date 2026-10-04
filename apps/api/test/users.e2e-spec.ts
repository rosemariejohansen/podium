import './helpers/tokens.js';
import { generateKeyPairSync } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { signServiceToken } from '@mos/service-token';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app.js';
import { resetDatabase } from './helpers/db.js';
import { auth, syncUser, systemToken, userToken } from './helpers/tokens.js';

describe('users + service-token guard (e2e)', () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDatabase();
  });
  const server = () => app.getHttpServer();

  describe('guard', () => {
    it('rejects a missing token', async () => {
      const res = await request(server()).get('/internal/me').expect(401);
      expect(res.body.error.code).toBe('INVALID_SERVICE_TOKEN');
    });
    it('rejects a malformed Authorization header', async () => {
      const scheme = await request(server())
        .get('/internal/me')
        .set('Authorization', 'Token abc')
        .expect(401);
      expect(scheme.body.error.code).toBe('INVALID_SERVICE_TOKEN');
      const notJwt = await request(server())
        .get('/internal/me')
        .set('Authorization', 'Bearer not.a.jwt')
        .expect(401);
      expect(notJwt.body.error.code).toBe('INVALID_SERVICE_TOKEN');
    });
    it('rejects a token signed with another key', async () => {
      const other = generateKeyPairSync('ed25519', {
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
      });
      const token = await signServiceToken(other.privateKey, { sub: 'u', scope: 'user' });
      const res = await request(server()).get('/internal/me').set(auth(token)).expect(401);
      expect(res.body.error.code).toBe('INVALID_SERVICE_TOKEN');
    });
    it('rejects an expired token', async () => {
      const token = await userToken('u', { now: new Date(Date.now() - 120_000) });
      const res = await request(server()).get('/internal/me').set(auth(token)).expect(401);
      expect(res.body.error.code).toBe('INVALID_SERVICE_TOKEN');
    });
    it('rejects a system token on a user route', async () => {
      const res = await request(server())
        .get('/internal/me')
        .set(auth(await systemToken()))
        .expect(401);
      expect(res.body.error.code).toBe('INVALID_SERVICE_TOKEN');
    });
    it('rejects a user token on the sync route', async () => {
      const res = await request(server())
        .post('/internal/users/sync')
        .set(auth(await userToken('u')))
        .send({ githubId: '1', login: 'neo', avatarUrl: null })
        .expect(401);
      expect(res.body.error.code).toBe('INVALID_SERVICE_TOKEN');
    });
  });

  describe('POST /internal/users/sync', () => {
    it('creates, then updates the same user by githubId', async () => {
      const first = await syncUser(server(), 'neo');
      expect(first).toEqual({ id: expect.any(String), login: 'neo', avatarUrl: null });
      const second = await request(server())
        .post('/internal/users/sync')
        .set(auth(await systemToken()))
        .send({
          githubId: 'gh-neo',
          login: 'the-one',
          avatarUrl: 'https://avatars.githubusercontent.com/u/1',
        })
        .expect(200);
      expect(second.body).toEqual({
        id: first.id,
        login: 'the-one',
        avatarUrl: 'https://avatars.githubusercontent.com/u/1',
      });
    });
    it('stores the avatarUrl when it creates a new user', async () => {
      const res = await request(server())
        .post('/internal/users/sync')
        .set(auth(await systemToken()))
        .send({
          githubId: 'gh-morpheus',
          login: 'morpheus',
          avatarUrl: 'https://avatars.githubusercontent.com/u/2',
        })
        .expect(200);
      expect(res.body).toEqual({
        id: expect.any(String),
        login: 'morpheus',
        avatarUrl: 'https://avatars.githubusercontent.com/u/2',
      });
    });
    it('validates the body', async () => {
      const res = await request(server())
        .post('/internal/users/sync')
        .set(auth(await systemToken()))
        .send({ githubId: '', login: 'neo' })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('GET /internal/me', () => {
    it('returns the caller', async () => {
      const user = await syncUser(server(), 'trinity');
      const res = await request(server())
        .get('/internal/me')
        .set(auth(await userToken(user.id)))
        .expect(200);
      expect(res.body).toEqual(user);
    });
    it("returns the user named by the token's sub, not just any user", async () => {
      const first = await syncUser(server(), 'neo');
      const second = await syncUser(server(), 'trinity');
      const asSecond = await request(server())
        .get('/internal/me')
        .set(auth(await userToken(second.id)))
        .expect(200);
      expect(asSecond.body).toEqual(second);
      const asFirst = await request(server())
        .get('/internal/me')
        .set(auth(await userToken(first.id)))
        .expect(200);
      expect(asFirst.body).toEqual(first);
    });
    it('404s for an unknown user id', async () => {
      const res = await request(server())
        .get('/internal/me')
        .set(auth(await userToken('missing')))
        .expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  it('sends Cache-Control: no-store on /internal successes and errors (PRD §9.2)', async () => {
    const user = await syncUser(server(), 'neo');
    const ok = await request(server())
      .get('/internal/me')
      .set(auth(await userToken(user.id)))
      .expect(200);
    expect(ok.headers['cache-control']).toBe('no-store');
    const unauthorized = await request(server()).get('/internal/me').expect(401);
    expect(unauthorized.headers['cache-control']).toBe('no-store');
  });

  it('keeps /internal routes out of the public OpenAPI document', async () => {
    const res = await request(server()).get('/docs-json').expect(200);
    expect(Object.keys(res.body.paths).filter((p) => p.startsWith('/internal'))).toEqual([]);
  });
});
