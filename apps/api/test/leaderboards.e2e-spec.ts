import './helpers/tokens.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { GameDto, LeaderboardDto, UserDto } from '@mos/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_LEADERBOARDS_PER_GAME } from '../src/leaderboards/leaderboards.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './helpers/app.js';
import { resetDatabase } from './helpers/db.js';
import { auth, syncUser, userToken } from './helpers/tokens.js';

describe('leaderboards (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let alice: UserDto;
  let bob: UserDto;
  let game: GameDto;
  const server = () => app.getHttpServer();
  const as = async (user: UserDto) => auth(await userToken(user.id));
  const board = {
    name: 'Fastest reaction',
    slug: 'fastest-reaction',
    sortOrder: 'ASC',
    unit: 'ms',
  };
  const createBoard = async (body: object, gameId = game.id, user = alice) =>
    request(server())
      .post(`/internal/games/${gameId}/leaderboards`)
      .set(await as(user))
      .send(body);
  const listBoards = async (gameId = game.id): Promise<LeaderboardDto[]> =>
    (
      await request(server())
        .get(`/internal/games/${gameId}/leaderboards`)
        .set(await as(alice))
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
  // Opens one pooled connection per racer first. On a cold pool the first request commits while
  // the others are still connecting, which hides a check-then-write race.
  const warmPool = (racers: number) =>
    Promise.all(
      Array.from({ length: racers }, () => prisma.$queryRaw`SELECT 1 FROM pg_sleep(0.05)`),
    );

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
    game = (
      await request(server())
        .post('/internal/games')
        .set(await as(alice))
        .send({ name: 'Asteroids', slug: 'asteroids' })
    ).body;
  });

  it('creates a board with review defaults and audits it', async () => {
    const res = await createBoard(board);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      gameId: game.id,
      name: 'Fastest reaction',
      slug: 'fastest-reaction',
      sortOrder: 'ASC',
      unit: 'ms',
      minScore: null,
      maxScore: null,
      reviewMarginPct: 25,
      reviewMinEntries: 10,
      createdAt: expect.any(String),
    } satisfies Record<keyof LeaderboardDto, unknown>);
    const audits = await prisma.auditLog.findMany({ where: { action: 'LEADERBOARD_CREATED' } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorId: alice.id,
      gameId: game.id,
      targetType: 'leaderboard',
      targetId: res.body.id,
      ip: '203.0.113.10',
      meta: { name: 'Fastest reaction', slug: 'fastest-reaction' },
    });
    const gameRes = await request(server())
      .get(`/internal/games/${game.id}`)
      .set(await as(alice));
    expect(gameRes.body.leaderboardCount).toBe(1);
  });

  it('round-trips score bounds', async () => {
    const res = await createBoard({ ...board, minScore: 0, maxScore: 600000 });
    expect(res.body).toMatchObject({ minScore: 0, maxScore: 600000 });
  });

  it('round-trips bounds at the safe-integer edge as exact JSON numbers (BIGINT)', async () => {
    const bounds = { minScore: -Number.MAX_SAFE_INTEGER, maxScore: Number.MAX_SAFE_INTEGER };
    const res = await createBoard({ ...board, ...bounds });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject(bounds);
    expect(await listBoards()).toMatchObject([bounds]);
    expect(
      await prisma.leaderboard.findUniqueOrThrow({
        where: { id: res.body.id },
        select: { minScore: true, maxScore: true },
      }),
    ).toEqual({ minScore: -9007199254740991n, maxScore: 9007199254740991n });
  });

  it('rejects invalid create bodies with 400 VALIDATION_FAILED', async () => {
    for (const body of [
      { ...board, slug: 'Not A Slug' },
      { name: board.name, slug: board.slug },
      { ...board, minScore: 10, maxScore: 5 },
      { ...board, unit: 'x'.repeat(11) },
      { ...board, minScore: 2 ** 53 },
    ]) {
      const res = await createBoard(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    }
    expect(await prisma.leaderboard.count()).toBe(0);
  });

  it('scopes slug uniqueness to the game', async () => {
    await createBoard(board);
    const taken = await createBoard(board);
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('SLUG_TAKEN');
    const other = (
      await request(server())
        .post('/internal/games')
        .set(await as(alice))
        .send({ name: 'Other', slug: 'other' })
    ).body;
    expect((await createBoard(board, other.id)).status).toBe(201);
  });

  it('enforces 20 boards per game', async () => {
    for (let i = 0; i < 20; i++)
      expect((await createBoard({ ...board, slug: `board-${i}` })).status).toBe(201);
    const res = await createBoard({ ...board, slug: 'board-20' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('QUOTA_EXCEEDED');
  });

  it('counts the boards quota per game', async () => {
    const other = await createOtherGame();
    // 19 boards on this game and 1 on the other: a database-wide count would already be at 20.
    await prisma.leaderboard.createMany({
      data: [
        ...Array.from({ length: MAX_LEADERBOARDS_PER_GAME - 1 }, (_, i) => ({
          gameId: game.id,
          name: `Seed ${i}`,
          slug: `seed-${i}`,
          sortOrder: 'DESC' as const,
        })),
        { gameId: other.id, name: 'Other seed', slug: 'other-seed', sortOrder: 'DESC' as const },
      ],
    });
    expect((await createBoard({ ...board, slug: 'second' }, other.id)).status).toBe(201);
    expect((await createBoard({ ...board, slug: 'twentieth' })).status).toBe(201);
    const full = await createBoard({ ...board, slug: 'twenty-first' });
    expect(full.status).toBe(403);
    expect(full.body.error.code).toBe('QUOTA_EXCEEDED');
  });

  it('holds the boards quota under concurrent creates', async () => {
    await prisma.leaderboard.createMany({
      data: Array.from({ length: MAX_LEADERBOARDS_PER_GAME - 1 }, (_, i) => ({
        gameId: game.id,
        name: `Seed ${i}`,
        slug: `seed-${i}`,
        sortOrder: 'DESC' as const,
      })),
    });
    const racers = 5;
    await warmPool(racers);
    const aliceAuth = await as(alice);
    // Sent together so the creates race each other.
    const results = await Promise.all(
      Array.from({ length: racers }, (_, i) =>
        request(server())
          .post(`/internal/games/${game.id}/leaderboards`)
          .set(aliceAuth)
          .send({ ...board, slug: `race-${i}` }),
      ),
    );
    const rejected = results.filter((r) => r.status !== 201);
    expect(results.length - rejected.length).toBe(1);
    expect(rejected.map((r) => [r.status, r.body.error?.code])).toEqual(
      Array.from({ length: racers - 1 }, () => [403, 'QUOTA_EXCEEDED']),
    );
    expect(await prisma.leaderboard.count({ where: { gameId: game.id } })).toBe(
      MAX_LEADERBOARDS_PER_GAME,
    );
  });

  it('lists boards oldest first', async () => {
    await createBoard({ ...board, slug: 'first' });
    await createBoard({ ...board, slug: 'second' });
    const res = await request(server())
      .get(`/internal/games/${game.id}/leaderboards`)
      .set(await as(alice))
      .expect(200);
    expect(res.body.map((b: LeaderboardDto) => b.slug)).toEqual(['first', 'second']);
  });

  it('lists only the requested game’s boards', async () => {
    const other = await createOtherGame();
    await createBoard({ ...board, slug: 'here' });
    await createBoard({ ...board, slug: 'elsewhere' }, other.id);
    expect((await listBoards()).map((b) => b.slug)).toEqual(['here']);
    expect((await listBoards(other.id)).map((b) => b.slug)).toEqual(['elsewhere']);
  });

  it('breaks createdAt ties by id, so the list order is stable', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    // One insert, in reverse id order (and slug order) with the same createdAt, as a seed may do.
    await prisma.leaderboard.createMany({
      data: ['c', 'b', 'a'].map((suffix, i) => ({
        id: `board-${suffix}`,
        gameId: game.id,
        name: `Board ${suffix}`,
        slug: `seed-${i}`,
        sortOrder: 'DESC' as const,
        createdAt,
      })),
    });
    const res = await request(server())
      .get(`/internal/games/${game.id}/leaderboards`)
      .set(await as(alice))
      .expect(200);
    expect(res.body.map((b: LeaderboardDto) => b.id)).toEqual(['board-a', 'board-b', 'board-c']);
  });

  it('validates bounds against stored values when only one side changes', async () => {
    const { body: created } = await createBoard({ ...board, minScore: 0, maxScore: 100 });
    const patch = async (body: object) =>
      request(server())
        .patch(`/internal/leaderboards/${created.id}`)
        .set(await as(alice))
        .send(body);
    const storedBounds = async () =>
      (await listBoards()).map(({ minScore, maxScore }) => ({ minScore, maxScore }));
    // Raising min above the stored max and lowering max below the stored min both fail.
    for (const body of [{ minScore: 200 }, { maxScore: -1 }]) {
      const bad = await patch(body);
      expect(bad.status, JSON.stringify(body)).toBe(400);
      expect(bad.body.error.code).toBe('VALIDATION_FAILED');
      expect(bad.body.error.details.issues[0].path).toBe('maxScore');
    }
    expect(await storedBounds()).toEqual([{ minScore: 0, maxScore: 100 }]);
    // null clears minScore, so a maxScore that conflicted with the old min is accepted with it.
    const cleared = await patch({ minScore: null, maxScore: -5 });
    expect(cleared.status).toBe(200);
    expect(cleared.body).toMatchObject({ minScore: null, maxScore: -5 });
    expect(await storedBounds()).toEqual([{ minScore: null, maxScore: -5 }]);
    expect((await patch({ maxScore: null })).status).toBe(200);
    expect((await patch({ minScore: 200 })).body).toMatchObject({ minScore: 200, maxScore: null });
  });

  it('leaves omitted fields unchanged on a partial PATCH and audits only the written fields', async () => {
    const { body: created } = await createBoard({
      ...board,
      minScore: -10,
      maxScore: 600000,
      reviewMarginPct: 40,
      reviewMinEntries: 3,
    });
    const res = await request(server())
      .patch(`/internal/leaderboards/${created.id}`)
      .set(await as(alice))
      .send({ name: 'Slowest reaction' })
      .expect(200);
    const expected = { ...created, name: 'Slowest reaction' };
    expect(res.body).toEqual(expected);
    const list = await request(server())
      .get(`/internal/games/${game.id}/leaderboards`)
      .set(await as(alice))
      .expect(200);
    expect(list.body).toEqual([expected]);
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'LEADERBOARD_UPDATED', targetId: created.id },
    });
    expect(audit).toMatchObject({
      actorId: alice.id,
      gameId: game.id,
      ip: '203.0.113.10',
      meta: { fields: ['name'] },
    });
  });

  it('serialises concurrent PATCHes so the merged bounds still hold', async () => {
    const { body: created } = await createBoard(board);
    await warmPool(2);
    const aliceAuth = await as(alice);
    // Sent together: each bound is valid against the unbounded board, but not with the other.
    const results = await Promise.all(
      [{ minScore: 200 }, { maxScore: 100 }].map((body) =>
        request(server()).patch(`/internal/leaderboards/${created.id}`).set(aliceAuth).send(body),
      ),
    );
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 400]);
    const winner = results.find((r) => r.status === 200);
    const loser = results.find((r) => r.status === 400);
    expect(loser?.body.error.code).toBe('VALIDATION_FAILED');
    expect(loser?.body.error.details.issues[0].path).toBe('maxScore');
    const list = await request(server())
      .get(`/internal/games/${game.id}/leaderboards`)
      .set(aliceAuth)
      .expect(200);
    const [{ minScore, maxScore }] = list.body as LeaderboardDto[];
    expect({ minScore, maxScore }).toEqual({
      minScore: winner?.body.minScore,
      maxScore: winner?.body.maxScore,
    });
    expect(minScore === null || maxScore === null || minScore <= maxScore).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: 'LEADERBOARD_UPDATED' } })).toBe(1);
  });

  it('refuses to change slug or sort order (FR-LB-2)', async () => {
    const { body: created } = await createBoard(board);
    // Each body also carries a valid field, so the 400 cannot come from the empty-patch check.
    for (const body of [
      { name: 'Renamed', slug: 'x-y-z' },
      { name: 'Renamed', sortOrder: 'DESC' },
    ]) {
      const res = await request(server())
        .patch(`/internal/leaderboards/${created.id}`)
        .set(await as(alice))
        .send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    }
    expect(await listBoards()).toEqual([created]);
  });

  it('hides other users’ boards and games behind 404', async () => {
    const { body: created } = await createBoard(board);
    const bobAuth = await as(bob);
    // Each request is built where it is awaited.
    for (const send of [
      () => request(server()).get(`/internal/games/${game.id}/leaderboards`).set(bobAuth),
      () => createBoard({ ...board, slug: 'bobs' }, game.id, bob),
      () =>
        request(server())
          .patch(`/internal/leaderboards/${created.id}`)
          .set(bobAuth)
          .send({ name: 'Mine' }),
      () =>
        request(server())
          .delete(`/internal/leaderboards/${created.id}`)
          .set(bobAuth)
          .send({ confirm: board.name }),
    ]) {
      const res = await send();
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
    expect(await listBoards()).toEqual([created]);
    expect(await prisma.leaderboard.count()).toBe(1);
    expect(await prisma.auditLog.count({ where: { actorId: bob.id } })).toBe(0);
  });

  it('deletes only with the exact name, and audits with the game id', async () => {
    const { body: created } = await createBoard(board);
    const del = async (confirm: string) =>
      request(server())
        .delete(`/internal/leaderboards/${created.id}`)
        .set(await as(alice))
        .send({ confirm });
    const mismatch = await del('fastest reaction');
    expect(mismatch.status).toBe(422);
    expect(mismatch.body.error.code).toBe('CONFIRMATION_MISMATCH');
    expect(await prisma.leaderboard.count()).toBe(1);
    expect((await del(board.name)).status).toBe(204);
    expect(await prisma.leaderboard.count()).toBe(0);
    const audits = await prisma.auditLog.findMany({ where: { action: 'LEADERBOARD_DELETED' } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorId: alice.id,
      gameId: game.id,
      targetType: 'leaderboard',
      targetId: created.id,
      ip: '203.0.113.10',
      meta: { name: board.name, slug: board.slug },
    });
  });

  it('cascades a board delete to its scores and reviews only (FR-LB-6)', async () => {
    const { body: doomed } = await createBoard(board);
    const { body: kept } = await createBoard({ ...board, slug: 'kept' });
    const player = await prisma.player.create({
      data: { gameId: game.id, externalId: 'player-1', displayName: 'Player' },
    });
    for (const leaderboardId of [doomed.id, kept.id]) {
      await prisma.score.create({
        data: { leaderboardId, playerId: player.id, value: 100n, achievedAt: new Date() },
      });
      await prisma.scoreReview.create({
        data: { leaderboardId, playerId: player.id, value: 900n, ruleCode: 'BEATS_TOP_BY_MARGIN' },
      });
    }
    const counts = async (leaderboardId: string) => ({
      scores: await prisma.score.count({ where: { leaderboardId } }),
      reviews: await prisma.scoreReview.count({ where: { leaderboardId } }),
    });
    expect(await counts(doomed.id)).toEqual({ scores: 1, reviews: 1 });

    await request(server())
      .delete(`/internal/leaderboards/${doomed.id}`)
      .set(await as(alice))
      .send({ confirm: board.name })
      .expect(204);

    expect(await counts(doomed.id)).toEqual({ scores: 0, reviews: 0 });
    expect(await counts(kept.id)).toEqual({ scores: 1, reviews: 1 });
    expect(await prisma.player.count()).toBe(1);
  });

  it('answers a double-submitted DELETE with 204 and 404, never 500', async () => {
    const { body: created } = await createBoard(board);
    await warmPool(2);
    const aliceAuth = await as(alice);
    const results = await Promise.all(
      Array.from({ length: 2 }, () =>
        request(server())
          .delete(`/internal/leaderboards/${created.id}`)
          .set(aliceAuth)
          .send({ confirm: board.name }),
      ),
    );
    expect(results.map((r) => [r.status, r.body.error?.code]).sort(([a], [b]) => a - b)).toEqual([
      [204, undefined],
      [404, 'NOT_FOUND'],
    ]);
    expect(await prisma.leaderboard.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'LEADERBOARD_DELETED' } })).toBe(1);
  });

  it('cascades when the game is deleted', async () => {
    expect((await createBoard(board)).status).toBe(201);
    expect(await prisma.leaderboard.count()).toBe(1);
    await request(server())
      .delete(`/internal/games/${game.id}`)
      .set(await as(alice))
      .send({ confirm: 'Asteroids' })
      .expect(204);
    expect(await prisma.leaderboard.count()).toBe(0);
  });
});
