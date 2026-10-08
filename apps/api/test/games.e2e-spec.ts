import './helpers/tokens.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { GameDto, UserDto } from '@mos/contracts';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_GAMES_PER_USER } from '../src/games/games.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './helpers/app.js';
import { resetDatabase } from './helpers/db.js';
import { auth, syncUser, userToken } from './helpers/tokens.js';

describe('games (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let alice: UserDto;
  let bob: UserDto;
  const server = () => app.getHttpServer();
  const as = async (user: UserDto) => auth(await userToken(user.id));
  const createGame = async (user: UserDto, body: object) =>
    request(server())
      .post('/internal/games')
      .set(await as(user))
      .send(body);
  /** One row of every table a game deletion cascades to. */
  const seedGameData = async (gameId: string, tag: string) => {
    const board = await prisma.leaderboard.create({
      data: { gameId, slug: `board-${tag}`, name: 'Board', sortOrder: 'DESC' },
    });
    const player = await prisma.player.create({
      data: { gameId, externalId: `player-${tag}`, displayName: 'Player' },
    });
    const score = await prisma.score.create({
      data: { leaderboardId: board.id, playerId: player.id, value: 100n, achievedAt: new Date() },
    });
    await prisma.scoreReview.create({
      data: {
        leaderboardId: board.id,
        playerId: player.id,
        value: 900n,
        ruleCode: 'BEATS_TOP_BY_MARGIN',
      },
    });
    await prisma.apiKey.create({
      data: {
        gameId,
        name: 'prod',
        prefix: `mos_${tag}`,
        hash: `hash-${tag}`,
        scopes: ['SCORES_WRITE'],
      },
    });
    await prisma.requestStat.create({
      data: { gameId, bucket: new Date(), route: 'GET /v1/x', statusClass: '2xx', count: 1 },
    });
    return { scoreId: score.id };
  };
  const countGameData = async (gameId: string) => ({
    boards: await prisma.leaderboard.count({ where: { gameId } }),
    keys: await prisma.apiKey.count({ where: { gameId } }),
    players: await prisma.player.count({ where: { gameId } }),
    scores: await prisma.score.count({ where: { leaderboard: { gameId } } }),
    reviews: await prisma.scoreReview.count({ where: { leaderboard: { gameId } } }),
    stats: await prisma.requestStat.count({ where: { gameId } }),
  });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDatabase();
    alice = await syncUser(server(), 'alice');
    bob = await syncUser(server(), 'bob');
  });

  it('creates a game and writes GAME_CREATED with the client ip', async () => {
    const res = await createGame(alice, {
      name: '  Asteroids ',
      slug: 'asteroids',
      description: 'Pew',
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      name: 'Asteroids',
      slug: 'asteroids',
      description: 'Pew',
      isPublic: true,
      createdAt: expect.any(String),
      leaderboardCount: 0,
      activeKeyCount: 0,
    } satisfies Record<keyof GameDto, unknown>);
    const audit = await prisma.auditLog.findMany({ where: { gameId: res.body.id } });
    expect(audit).toMatchObject([
      { action: 'GAME_CREATED', actorId: alice.id, ip: '203.0.113.10', targetType: 'game' },
    ]);
  });

  it('lists only the caller’s games', async () => {
    await createGame(alice, { name: 'A', slug: 'game-a' });
    await createGame(bob, { name: 'B', slug: 'game-b' });
    const res = await request(server())
      .get('/internal/games')
      .set(await as(alice))
      .expect(200);
    expect(res.body.map((g: GameDto) => g.slug)).toEqual(['game-a']);
  });

  it('returns the owner’s game as a full GameDto with counts', async () => {
    const { body: created } = await createGame(alice, {
      name: 'Asteroids',
      slug: 'asteroids',
      description: 'Pew',
    });
    await seedGameData(created.id, 'a'); // one board and one active key
    await prisma.apiKey.createMany({
      data: [
        { revokedAt: new Date(), tag: 'revoked' },
        { expiresAt: new Date(Date.now() - 60_000), tag: 'expired' },
      ].map(({ tag, ...rest }) => ({
        gameId: created.id,
        name: tag,
        prefix: `mos_${tag}`,
        hash: `hash-${tag}`,
        scopes: ['SCORES_READ' as const],
        ...rest,
      })),
    });
    const res = await request(server())
      .get(`/internal/games/${created.id}`)
      .set(await as(alice))
      .expect(200);
    expect(res.body).toEqual({ ...created, leaderboardCount: 1, activeKeyCount: 1 });

    const missing = await request(server())
      .get('/internal/games/no-such-game')
      .set(await as(alice));
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects reserved and malformed slugs with 400', async () => {
    expect((await createGame(alice, { name: 'X', slug: 'dashboard' })).status).toBe(400);
    expect((await createGame(alice, { name: 'X', slug: 'Bad_Slug' })).status).toBe(400);
  });

  it('returns 409 SLUG_TAKEN for a slug used by anyone', async () => {
    await createGame(bob, { name: 'B', slug: 'shared' });
    const res = await createGame(alice, { name: 'A', slug: 'shared' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLUG_TAKEN');
  });

  it('maps a concurrent duplicate slug to 409', async () => {
    const [r1, r2] = await Promise.all([
      createGame(alice, { name: 'One', slug: 'race' }),
      createGame(alice, { name: 'Two', slug: 'race' }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
  });

  it('enforces 10 games per user with 403 QUOTA_EXCEEDED', async () => {
    for (let i = 0; i < 10; i++)
      expect((await createGame(alice, { name: `G${i}`, slug: `game-${i}` })).status).toBe(201);
    const res = await createGame(alice, { name: 'Eleven', slug: 'game-11' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('QUOTA_EXCEEDED');
  });

  it('holds the games quota under concurrent creates', async () => {
    await prisma.game.createMany({
      data: Array.from({ length: MAX_GAMES_PER_USER - 1 }, (_, i) => ({
        ownerId: alice.id,
        name: `G${i}`,
        slug: `seed-${i}`,
      })),
    });
    const racers = 6;
    // Open one pooled connection per racer first. On a cold pool the first create commits while
    // the others are still connecting, which hides a check-then-insert race.
    await Promise.all(
      Array.from({ length: racers }, () => prisma.$queryRaw`SELECT 1 FROM pg_sleep(0.05)`),
    );
    const aliceAuth = await as(alice);
    // Sent together so the creates race each other.
    const results = await Promise.all(
      Array.from({ length: racers }, (_, i) =>
        request(server())
          .post('/internal/games')
          .set(aliceAuth)
          .send({ name: `Race ${i}`, slug: `race-${i}` }),
      ),
    );
    const rejected = results.filter((r) => r.status !== 201);
    expect(results.length - rejected.length).toBe(1);
    expect(rejected.map((r) => [r.status, r.body.error?.code])).toEqual(
      Array.from({ length: racers - 1 }, () => [403, 'QUOTA_EXCEEDED']),
    );
    expect(await prisma.game.count({ where: { ownerId: alice.id } })).toBe(MAX_GAMES_PER_USER);
  });

  it('updates name, description and visibility, and audits the changed fields', async () => {
    const { body: game } = await createGame(alice, {
      name: 'Asteroids',
      slug: 'asteroids',
      description: 'old',
    });
    const res = await request(server())
      .patch(`/internal/games/${game.id}`)
      .set(await as(alice))
      .send({ name: 'Asteroids 2', description: null, isPublic: false })
      .expect(200);
    expect(res.body).toMatchObject({
      name: 'Asteroids 2',
      description: null,
      isPublic: false,
      slug: 'asteroids',
    });
    const audit = await prisma.auditLog.findFirst({
      where: { gameId: game.id, action: 'GAME_UPDATED' },
    });
    expect(audit?.meta).toEqual({ fields: ['name', 'description', 'isPublic'] });
  });

  it('refuses to change the slug', async () => {
    const { body: game } = await createGame(alice, { name: 'A', slug: 'asteroids' });
    await request(server())
      .patch(`/internal/games/${game.id}`)
      .set(await as(alice))
      .send({ slug: 'other' })
      .expect(400);
  });

  it('hides other users’ games behind 404', async () => {
    const { body: game } = await createGame(alice, { name: 'Asteroids', slug: 'asteroids' });
    const bobAuth = await as(bob);
    // Each request is built where it is awaited.
    for (const send of [
      () => request(server()).get(`/internal/games/${game.id}`).set(bobAuth),
      () =>
        request(server()).patch(`/internal/games/${game.id}`).set(bobAuth).send({ name: 'Mine' }),
      () =>
        request(server())
          .delete(`/internal/games/${game.id}`)
          .set(bobAuth)
          .send({ confirm: 'Asteroids' }),
    ]) {
      const res = await send();
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
    expect(await prisma.game.count()).toBe(1);
  });

  describe('delete', () => {
    let game: GameDto;
    beforeEach(async () => {
      game = (await createGame(alice, { name: 'Asteroids', slug: 'asteroids' })).body;
    });
    const del = async (body: object) =>
      request(server())
        .delete(`/internal/games/${game.id}`)
        .set(await as(alice))
        .send(body);

    it('rejects a case-mismatched confirmation', async () => {
      const res = await del({ confirm: 'asteroids' });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('CONFIRMATION_MISMATCH');
      expect(await prisma.game.count()).toBe(1);
    });
    it('rejects a confirmation with trailing whitespace', async () => {
      expect((await del({ confirm: 'Asteroids ' })).status).toBe(422);
    });
    it('requires a confirm field', async () => {
      expect((await del({})).status).toBe(400);
    });
    it('deletes with the exact name and keeps an audit row that outlives the game', async () => {
      await del({ confirm: 'Asteroids' }).then((r) => expect(r.status).toBe(204));
      expect(await prisma.game.count()).toBe(0);
      const audit = await prisma.auditLog.findFirst({ where: { action: 'GAME_DELETED' } });
      expect(audit).toMatchObject({
        gameId: null,
        targetId: game.id,
        meta: { name: 'Asteroids', slug: 'asteroids' },
      });
    });

    it('cascades to boards, keys, players, scores, reviews and stats (FR-GAME-3)', async () => {
      const { body: other } = await createGame(bob, { name: 'Other', slug: 'other' });
      await seedGameData(game.id, 'a');
      await seedGameData(other.id, 'b');
      const one = { boards: 1, keys: 1, players: 1, scores: 1, reviews: 1, stats: 1 };
      expect(await countGameData(game.id)).toEqual(one);

      expect((await del({ confirm: 'Asteroids' })).status).toBe(204);

      expect(await countGameData(game.id)).toEqual({
        boards: 0,
        keys: 0,
        players: 0,
        scores: 0,
        reviews: 0,
        stats: 0,
      });
      expect(await countGameData(other.id)).toEqual(one);
    });

    it('commits a delete whose cascade outlasts Prisma’s default 5 s transaction timeout', async () => {
      const { scoreId } = await seedGameData(game.id, 'slow');
      // Stands in for a slow cascade: another session holds a lock on one of the game's scores.
      const blocker = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await blocker.connect();
      try {
        await blocker.query('BEGIN');
        await blocker.query('SELECT 1 FROM "Score" WHERE id = $1 FOR UPDATE', [scoreId]);
        const pending = del({ confirm: 'Asteroids' });
        await vi.waitFor(
          async () => {
            const { rows } = await blocker.query<{ waiting: number }>(
              'SELECT count(*)::int AS waiting FROM pg_locks WHERE NOT granted',
            );
            expect(rows[0]?.waiting).toBeGreaterThan(0);
          },
          { timeout: 4_000, interval: 50 },
        );
        await new Promise((resolve) => setTimeout(resolve, 6_000));
        await blocker.query('COMMIT');
        const res = await pending;
        expect(res.status).toBe(204);
      } finally {
        await blocker.end();
      }
      expect(await prisma.game.count()).toBe(0);
      expect(await prisma.score.count()).toBe(0);
    });
  });
});
