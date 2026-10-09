import './helpers/tokens.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ApiKeyCreatedDto, ApiKeyDto, GameDto, UserDto } from '@mos/contracts';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { apiKeyCacheKey } from '../src/api-keys/api-key-cache.js';
import { API_KEY_PREFIX_LENGTH, hashApiKey, parseApiKey } from '../src/api-keys/key-format.js';
import { MAX_ACTIVE_KEYS_PER_GAME } from '../src/api-keys/api-keys.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { REDIS } from '../src/redis/redis.module.js';
import { createTestApp } from './helpers/app.js';
import { resetDatabase, resetRedis } from './helpers/db.js';
import { auth, syncUser, systemToken, userToken } from './helpers/tokens.js';

describe('api keys (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let alice: UserDto;
  let bob: UserDto;
  let game: GameDto;
  const server = () => app.getHttpServer();
  const as = async (user: UserDto) => auth(await userToken(user.id));
  const createKey = async (body: object, user = alice, gameId = game.id) =>
    request(server())
      .post(`/internal/games/${gameId}/keys`)
      .set(await as(user))
      .send(body);
  const prodKey = { name: 'prod', scopes: ['scores:read', 'scores:write'], expiresInDays: null };

  // Added by the test writer (not in the brief), below the brief's own tests.
  const revokeKey = async (id: string, user = alice) =>
    request(server())
      .delete(`/internal/keys/${id}`)
      .set(await as(user));
  const listKeys = async (gameId = game.id, user = alice): Promise<ApiKeyDto[]> =>
    (
      await request(server())
        .get(`/internal/games/${gameId}/keys`)
        .set(await as(user))
        .expect(200)
    ).body;
  const createOtherGame = async (): Promise<GameDto> =>
    (
      await request(server())
        .post('/internal/games')
        .set(await as(alice))
        .send({ name: 'Other', slug: 'other' })
        .expect(201)
    ).body;
  // Rows written straight to the database, as a seed or an earlier release would: hashes are fake but unique.
  const seedKeys = (count: number, extra: object = {}, gameId = game.id, label = 'seed') =>
    prisma.apiKey.createMany({
      data: Array.from({ length: count }, (_, i) => ({
        gameId,
        name: `${label} ${i}`,
        prefix: 'mos_seedseed',
        hash: `${label}-${gameId}-${i}`,
        scopes: ['SCORES_READ' as const],
        ...extra,
      })),
    });
  // Opens one pooled connection per racer first. On a cold pool the first request commits while
  // the others are still connecting, which hides a check-then-write race.
  const warmPool = (racers: number) =>
    Promise.all(
      Array.from({ length: racers }, () => prisma.$queryRaw`SELECT 1 FROM pg_sleep(0.05)`),
    );
  const activeKeys = (gameId = game.id) =>
    prisma.apiKey.count({
      where: {
        gameId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    redis = app.get(REDIS);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDatabase();
    await resetRedis(redis);
    alice = await syncUser(server(), 'alice');
    bob = await syncUser(server(), 'bob');
    game = (
      await request(server())
        .post('/internal/games')
        .set(await as(alice))
        .send({ name: 'Asteroids', slug: 'asteroids' })
    ).body;
  });

  it('returns the full key exactly once and stores only its hash', async () => {
    const res = await createKey(prodKey);
    expect(res.status).toBe(201);
    const created = res.body as ApiKeyCreatedDto;
    expect(parseApiKey(created.key)).toBe(true);
    expect(created).toMatchObject({
      name: 'prod',
      prefix: created.key.slice(0, 12),
      scopes: ['scores:read', 'scores:write'],
      status: 'active',
      expiresAt: null,
    });

    const row = await prisma.apiKey.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.hash).toBe(hashApiKey(created.key));
    expect(JSON.stringify(row)).not.toContain(created.key);

    const list = await request(server())
      .get(`/internal/games/${game.id}/keys`)
      .set(await as(alice))
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).not.toHaveProperty('key');
    expect(list.body[0]).not.toHaveProperty('hash');
    expect(await prisma.auditLog.findFirst({ where: { action: 'KEY_CREATED' } })).toMatchObject({
      targetId: created.id,
      meta: { name: 'prod', prefix: created.prefix, scopes: ['scores:read', 'scores:write'] },
    });
  });

  it('sets expiry from expiresInDays', async () => {
    const before = Date.now();
    const { body } = await createKey({ ...prodKey, expiresInDays: 30 });
    const expires = new Date(body.expiresAt).getTime();
    expect(expires - before).toBeGreaterThanOrEqual(30 * 86_400_000 - 1000);
    expect(expires - before).toBeLessThanOrEqual(30 * 86_400_000 + 5000);
  });

  it('stores read-only scopes', async () => {
    const { body } = await createKey({
      name: 'reader',
      scopes: ['scores:read'],
      expiresInDays: 90,
    });
    expect(body.scopes).toEqual(['scores:read']);
  });

  it('rejects invalid input', async () => {
    expect((await createKey({ ...prodKey, scopes: [] })).status).toBe(400);
    expect((await createKey({ ...prodKey, expiresInDays: 7 })).status).toBe(400);
  });

  it('enforces 10 active keys per game, ignoring revoked ones', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) ids.push((await createKey({ ...prodKey, name: `k${i}` })).body.id);
    const blocked = await createKey({ ...prodKey, name: 'k10' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('QUOTA_EXCEEDED');
    await request(server())
      .delete(`/internal/keys/${ids[0]}`)
      .set(await as(alice))
      .expect(200);
    expect((await createKey({ ...prodKey, name: 'k10' })).status).toBe(201);
  });

  it('counts active keys on the game', async () => {
    await createKey(prodKey);
    const res = await request(server())
      .get(`/internal/games/${game.id}`)
      .set(await as(alice));
    expect(res.body.activeKeyCount).toBe(1);
  });

  it('revokes immediately: status, timestamp, cache entry and audit', async () => {
    const created = (await createKey(prodKey)).body as ApiKeyCreatedDto;
    const cacheKey = apiKeyCacheKey(hashApiKey(created.key));
    await redis.set(cacheKey, JSON.stringify({ id: created.id }), 'EX', 60);

    const res = await request(server())
      .delete(`/internal/keys/${created.id}`)
      .set(await as(alice))
      .expect(200);
    expect(res.body).toMatchObject({
      id: created.id,
      status: 'revoked',
      revokedAt: expect.any(String),
    });
    expect(await redis.exists(cacheKey)).toBe(0);
    expect(
      await prisma.auditLog.count({ where: { action: 'KEY_REVOKED', targetId: created.id } }),
    ).toBe(1);
  });

  it('treats a repeated revoke as a no-op with a single audit row', async () => {
    const created = (await createKey(prodKey)).body as ApiKeyDto;
    const first = await request(server())
      .delete(`/internal/keys/${created.id}`)
      .set(await as(alice))
      .expect(200);
    const second = await request(server())
      .delete(`/internal/keys/${created.id}`)
      .set(await as(alice))
      .expect(200);
    expect(second.body.revokedAt).toBe(first.body.revokedAt);
    expect(await prisma.auditLog.count({ where: { action: 'KEY_REVOKED' } })).toBe(1);
  });

  it('hides other users’ keys and games behind 404', async () => {
    const created = (await createKey(prodKey)).body as ApiKeyDto;
    const bobAuth = await as(bob);
    await request(server()).get(`/internal/games/${game.id}/keys`).set(bobAuth).expect(404);
    expect((await createKey(prodKey, bob)).status).toBe(404);
    await request(server()).delete(`/internal/keys/${created.id}`).set(bobAuth).expect(404);
    expect(
      (await prisma.apiKey.findUniqueOrThrow({ where: { id: created.id } })).revokedAt,
    ).toBeNull();
  });

  // ---- Added by the test writer: Task 10-11 lessons and the PRD security invariants ----

  it('answers create with exactly the documented fields', async () => {
    const res = await createKey(prodKey);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      gameId: game.id,
      name: 'prod',
      prefix: expect.stringMatching(/^mos_[0-9A-Za-z]{8}$/),
      scopes: ['scores:read', 'scores:write'],
      status: 'active',
      createdAt: expect.any(String),
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      key: expect.any(String),
    } satisfies Record<keyof ApiKeyCreatedDto, unknown>);
  });

  it('never returns the key or its hash after create, and never audits them', async () => {
    const created = (await createKey(prodKey)).body as ApiKeyCreatedDto;
    const secret = created.key.slice(API_KEY_PREFIX_LENGTH); // everything the dashboard does not show
    const hash = hashApiKey(created.key);
    const gameRes = await request(server())
      .get(`/internal/games/${game.id}`)
      .set(await as(alice))
      .expect(200);
    const revoked = await revokeKey(created.id);
    expect(revoked.status).toBe(200);
    const responses = [await listKeys(), gameRes.body, revoked.body];
    for (const body of responses) {
      const text = JSON.stringify(body);
      expect(text).not.toContain(secret);
      expect(text).not.toContain(hash);
    }
    expect(JSON.stringify(await listKeys())).toContain(created.prefix);
    const audits = JSON.stringify(await prisma.auditLog.findMany());
    expect(audits).not.toContain(secret);
    expect(audits).not.toContain(hash);
  });

  it('pins actor, game, target and ip on the create and revoke audit rows', async () => {
    const created = (await createKey({ ...prodKey, name: '  prod  ', scopes: ['scores:write'] }))
      .body as ApiKeyCreatedDto;
    await revokeKey(created.id);
    const base = {
      actorId: alice.id,
      gameId: game.id,
      targetType: 'api_key',
      targetId: created.id,
      ip: '203.0.113.10',
    };
    const createdAudit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'KEY_CREATED' },
    });
    expect(createdAudit).toMatchObject(base);
    expect(createdAudit.meta).toEqual({
      name: 'prod',
      prefix: created.prefix,
      scopes: ['scores:write'],
    });
    const revokedAudit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'KEY_REVOKED' },
    });
    expect(revokedAudit).toMatchObject(base);
    expect(revokedAudit.meta).toEqual({ name: 'prod', prefix: created.prefix });
  });

  it('rejects invalid create bodies with 400 VALIDATION_FAILED and creates nothing', async () => {
    for (const body of [
      { scopes: prodKey.scopes, expiresInDays: null },
      { ...prodKey, name: 'x'.repeat(41) },
      { ...prodKey, name: '   ' },
      { name: 'prod', scopes: prodKey.scopes },
      { ...prodKey, scopes: ['scores:read', 'scores:read'] },
      { ...prodKey, scopes: ['admin'] },
      { ...prodKey, expiresInDays: '30' },
      { ...prodKey, expiresInDays: 0 },
      // The client cannot pick the hash, the owner or the lifecycle fields.
      { ...prodKey, hash: 'a'.repeat(64) },
      { ...prodKey, gameId: 'other' },
      { ...prodKey, revokedAt: null },
    ]) {
      const res = await createKey(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    }
    expect(await prisma.apiKey.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'KEY_CREATED' } })).toBe(0);
  });

  it('rejects missing, wrong-scope and system tokens on every key route', async () => {
    const created = (await createKey(prodKey)).body as ApiKeyDto;
    const sys = auth(await systemToken());
    for (const send of [
      () => request(server()).get(`/internal/games/${game.id}/keys`),
      () => request(server()).post(`/internal/games/${game.id}/keys`).send(prodKey),
      () => request(server()).delete(`/internal/keys/${created.id}`),
      () => request(server()).get(`/internal/games/${game.id}/keys`).set(sys),
      () => request(server()).post(`/internal/games/${game.id}/keys`).set(sys).send(prodKey),
      () => request(server()).delete(`/internal/keys/${created.id}`).set(sys),
    ]) {
      const res = await send();
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_SERVICE_TOKEN');
    }
    expect(await prisma.apiKey.count()).toBe(1);
    expect(
      (await prisma.apiKey.findUniqueOrThrow({ where: { id: created.id } })).revokedAt,
    ).toBeNull();
  });

  it('holds the active-key quota under concurrent creates', async () => {
    await seedKeys(MAX_ACTIVE_KEYS_PER_GAME - 1);
    const racers = 5;
    await warmPool(racers);
    const aliceAuth = await as(alice);
    // Sent together so the creates race each other.
    const results = await Promise.all(
      Array.from({ length: racers }, (_, i) =>
        request(server())
          .post(`/internal/games/${game.id}/keys`)
          .set(aliceAuth)
          .send({ ...prodKey, name: `race-${i}` }),
      ),
    );
    const rejected = results.filter((r) => r.status !== 201);
    expect(results.length - rejected.length).toBe(1);
    expect(rejected.map((r) => [r.status, r.body.error?.code])).toEqual(
      Array.from({ length: racers - 1 }, () => [403, 'QUOTA_EXCEEDED']),
    );
    expect(await activeKeys()).toBe(MAX_ACTIVE_KEYS_PER_GAME);
    expect(await prisma.auditLog.count({ where: { action: 'KEY_CREATED' } })).toBe(1);
  });

  it('counts the key quota per game', async () => {
    const other = await createOtherGame();
    // 9 keys here and 10 on the other game: a database-wide count would already block this game.
    await seedKeys(MAX_ACTIVE_KEYS_PER_GAME - 1);
    await seedKeys(MAX_ACTIVE_KEYS_PER_GAME, {}, other.id, 'elsewhere');
    expect((await createKey(prodKey)).status).toBe(201);
    const full = await createKey(prodKey);
    expect(full.status).toBe(403);
    expect(full.body.error.code).toBe('QUOTA_EXCEEDED');
    const otherFull = await createKey(prodKey, alice, other.id);
    expect(otherFull.status).toBe(403);
    expect(otherFull.body.error.code).toBe('QUOTA_EXCEEDED');
  });

  it('does not count expired or revoked keys toward the quota', async () => {
    await seedKeys(MAX_ACTIVE_KEYS_PER_GAME - 2, {}, game.id, 'active');
    await seedKeys(1, { expiresAt: new Date(Date.now() - 60_000) }, game.id, 'expired');
    await seedKeys(1, { revokedAt: new Date() }, game.id, 'revoked');
    expect(await activeKeys()).toBe(MAX_ACTIVE_KEYS_PER_GAME - 2);
    expect((await createKey({ ...prodKey, name: 'a' })).status).toBe(201);
    expect((await createKey({ ...prodKey, name: 'b' })).status).toBe(201);
    const full = await createKey({ ...prodKey, name: 'c' });
    expect(full.status).toBe(403);
    expect(full.body.error.code).toBe('QUOTA_EXCEEDED');
  });

  it('lists statuses, and the game’s activeKeyCount counts only the active key', async () => {
    await seedKeys(1, { expiresAt: new Date(Date.now() + 86_400_000) }, game.id, 'live');
    await seedKeys(1, { expiresAt: new Date(Date.now() - 60_000) }, game.id, 'expired');
    await seedKeys(
      1,
      { revokedAt: new Date(), expiresAt: new Date(Date.now() - 60_000) },
      game.id,
      'revoked',
    );
    const statuses = Object.fromEntries(
      (await listKeys()).map((k) => [k.name.split(' ')[0], k.status]),
    );
    expect(statuses).toEqual({ live: 'active', expired: 'expired', revoked: 'revoked' });
    const res = await request(server())
      .get(`/internal/games/${game.id}`)
      .set(await as(alice))
      .expect(200);
    expect(res.body.activeKeyCount).toBe(1);
  });

  it('lists only the requested game’s keys, newest first', async () => {
    const other = await createOtherGame();
    for (const [name, createdAt] of [
      ['oldest', '2026-01-01'],
      ['newest', '2026-03-01'],
      ['middle', '2026-02-01'],
    ] as const) {
      await seedKeys(1, { createdAt: new Date(createdAt) }, game.id, name);
    }
    await seedKeys(1, {}, other.id, 'elsewhere');
    expect((await listKeys()).map((k) => k.name.split(' ')[0])).toEqual([
      'newest',
      'middle',
      'oldest',
    ]);
    expect((await listKeys(other.id)).map((k) => k.name.split(' ')[0])).toEqual(['elsewhere']);
  });

  it('breaks createdAt ties by id (descending), so the list order is stable', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    // Inserted in neither id order, so only an explicit tie-break gives a fixed answer.
    for (const suffix of ['a', 'c', 'b']) {
      await seedKeys(1, { id: `key-${suffix}`, createdAt }, game.id, `tie-${suffix}`);
    }
    expect((await listKeys()).map((k) => k.id)).toEqual(['key-c', 'key-b', 'key-a']);
  });

  it('keeps a revoked key in the list with its revoked status', async () => {
    const created = (await createKey(prodKey)).body as ApiKeyDto;
    const revoked = (await revokeKey(created.id)).body as ApiKeyDto;
    expect(await listKeys()).toEqual([revoked]);
    expect(revoked.status).toBe('revoked');
  });

  it('serialises concurrent revokes: both 200 with one revoked DTO, one audit row, cache gone', async () => {
    const created = (await createKey(prodKey)).body as ApiKeyCreatedDto;
    const cacheKey = apiKeyCacheKey(hashApiKey(created.key));
    await redis.set(cacheKey, JSON.stringify({ id: created.id }), 'EX', 60);
    await warmPool(2);
    const aliceAuth = await as(alice);
    const results = await Promise.all(
      Array.from({ length: 2 }, () =>
        request(server()).delete(`/internal/keys/${created.id}`).set(aliceAuth),
      ),
    );
    expect(results.map((r) => [r.status, r.body.error?.code])).toEqual([
      [200, undefined],
      [200, undefined],
    ]);
    for (const r of results) expect(r.body).toMatchObject({ id: created.id, status: 'revoked' });
    expect(results[1]!.body.revokedAt).toBe(results[0]!.body.revokedAt);
    const [row] = await prisma.apiKey.findMany({ where: { id: created.id } });
    expect(row!.revokedAt!.toISOString()).toBe(results[0]!.body.revokedAt);
    expect(await prisma.auditLog.count({ where: { action: 'KEY_REVOKED' } })).toBe(1);
    expect(await redis.exists(cacheKey)).toBe(0);
  });

  it('deletes only the revoked key’s cache entry', async () => {
    const first = (await createKey({ ...prodKey, name: 'first' })).body as ApiKeyCreatedDto;
    const second = (await createKey({ ...prodKey, name: 'second' })).body as ApiKeyCreatedDto;
    const firstCache = apiKeyCacheKey(hashApiKey(first.key));
    const secondCache = apiKeyCacheKey(hashApiKey(second.key));
    await redis.set(firstCache, '{}', 'EX', 60);
    await redis.set(secondCache, '{}', 'EX', 60);
    await redis.set('unrelated', 'kept', 'EX', 60);
    await revokeKey(first.id);
    expect(await redis.exists(firstCache)).toBe(0);
    expect(await redis.exists(secondCache)).toBe(1);
    expect(await redis.get('unrelated')).toBe('kept');
  });

  it('deleting a game deletes the cache entries of every key it had, and only those (FR-KEY-4)', async () => {
    const first = (await createKey({ ...prodKey, name: 'first' })).body as ApiKeyCreatedDto;
    const second = (await createKey({ ...prodKey, name: 'second' })).body as ApiKeyCreatedDto;
    await revokeKey(second.id);
    const other = await createOtherGame();
    const survivor = (await createKey({ ...prodKey, name: 'survivor' }, alice, other.id))
      .body as ApiKeyCreatedDto;
    const firstCache = apiKeyCacheKey(hashApiKey(first.key));
    const secondCache = apiKeyCacheKey(hashApiKey(second.key));
    const survivorCache = apiKeyCacheKey(hashApiKey(survivor.key));
    // As the Week 2 guard would cache them; the revoked key's entry is put back by hand.
    for (const cacheKey of [firstCache, secondCache, survivorCache]) {
      await redis.set(cacheKey, '{}', 'EX', 60);
    }
    await redis.set('unrelated', 'kept', 'EX', 60);

    await request(server())
      .delete(`/internal/games/${game.id}`)
      .set(await as(alice))
      .send({ confirm: 'Asteroids' })
      .expect(204);

    expect(await prisma.apiKey.count({ where: { gameId: game.id } })).toBe(0);
    expect(await redis.exists(firstCache)).toBe(0);
    expect(await redis.exists(secondCache)).toBe(0);
    expect(await redis.exists(survivorCache)).toBe(1);
    expect(await redis.get('unrelated')).toBe('kept');
  });

  it('revokes an expired key too: revoked beats expired', async () => {
    await seedKeys(
      1,
      { id: 'expired-key', expiresAt: new Date(Date.now() - 60_000) },
      game.id,
      'expired',
    );
    const res = await revokeKey('expired-key');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 'expired-key',
      status: 'revoked',
      revokedAt: expect.any(String),
    });
    expect(
      await prisma.auditLog.count({ where: { action: 'KEY_REVOKED', targetId: 'expired-key' } }),
    ).toBe(1);
  });

  it('answers NOT_FOUND for other users’ and unknown keys and games, and changes nothing', async () => {
    const created = (await createKey(prodKey)).body as ApiKeyCreatedDto;
    const cacheKey = apiKeyCacheKey(hashApiKey(created.key));
    await redis.set(cacheKey, JSON.stringify({ id: created.id }), 'EX', 60);
    const bobAuth = await as(bob);
    // Each request is built where it is awaited.
    for (const send of [
      () => request(server()).get(`/internal/games/${game.id}/keys`).set(bobAuth),
      () => createKey(prodKey, bob),
      () => request(server()).delete(`/internal/keys/${created.id}`).set(bobAuth),
      () => request(server()).get('/internal/games/no-such-game/keys').set(bobAuth),
      () => createKey(prodKey, alice, 'no-such-game'),
      () => request(server()).delete('/internal/keys/no-such-key').set(bobAuth),
      () => revokeKey('no-such-key'),
    ]) {
      const res = await send();
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
    expect(await prisma.apiKey.count()).toBe(1);
    expect(
      (await prisma.apiKey.findUniqueOrThrow({ where: { id: created.id } })).revokedAt,
    ).toBeNull();
    expect(await redis.exists(cacheKey)).toBe(1);
    expect(await prisma.auditLog.count({ where: { actorId: bob.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'KEY_REVOKED' } })).toBe(0);
  });
});
