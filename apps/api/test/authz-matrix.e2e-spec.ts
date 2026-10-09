import './helpers/tokens.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { UserDto } from '@mos/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './helpers/app.js';
import { resetDatabase } from './helpers/db.js';
import { auth, syncUser, systemToken, userToken } from './helpers/tokens.js';

type Method = 'get' | 'post' | 'patch' | 'delete';
type Target = 'game' | 'board' | 'key';
interface Route {
  method: Method;
  /** The Express route pattern, exactly as the app registers it. */
  pattern: string;
  /** Which seeded resource the single path parameter refers to (absent: collection route). */
  target?: Target;
  body?: object;
}
type Ids = Record<Target, string>;

/**
 * Every /internal route that targets a specific resource. Add new routes here (PRD §16.2);
 * the completeness test below fails when the app registers a route that no table lists.
 */
const resourceRoutes: Route[] = [
  { method: 'get', pattern: '/internal/games/:gameId', target: 'game' },
  { method: 'patch', pattern: '/internal/games/:gameId', target: 'game', body: { name: 'Stolen' } },
  {
    method: 'delete',
    pattern: '/internal/games/:gameId',
    target: 'game',
    body: { confirm: 'Asteroids' },
  },
  { method: 'get', pattern: '/internal/games/:gameId/leaderboards', target: 'game' },
  {
    method: 'post',
    pattern: '/internal/games/:gameId/leaderboards',
    target: 'game',
    body: { name: 'X', slug: 'xyz', sortOrder: 'DESC' },
  },
  {
    method: 'patch',
    pattern: '/internal/leaderboards/:id',
    target: 'board',
    body: { name: 'Stolen' },
  },
  {
    method: 'delete',
    pattern: '/internal/leaderboards/:id',
    target: 'board',
    body: { confirm: 'High score' },
  },
  { method: 'get', pattern: '/internal/games/:gameId/keys', target: 'game' },
  {
    method: 'post',
    pattern: '/internal/games/:gameId/keys',
    target: 'game',
    body: { name: 'k', scopes: ['scores:read'], expiresInDays: null },
  },
  { method: 'delete', pattern: '/internal/keys/:id', target: 'key' },
];

/** Routes with no resource id: any signed-in user may call them for themselves. */
const collectionRoutes: Route[] = [
  { method: 'get', pattern: '/internal/me' },
  { method: 'get', pattern: '/internal/games' },
  { method: 'post', pattern: '/internal/games', body: { name: 'X', slug: 'xyz' } },
];

/** Routes only the web app's system token may call. */
const systemOnlyRoutes: Route[] = [
  {
    method: 'post',
    pattern: '/internal/users/sync',
    body: { githubId: 'gh-x', login: 'x', avatarUrl: null },
  },
];

const label = (r: Route) => `${r.method} ${r.pattern}`;
const pathFor = (r: Route, ids: Ids) =>
  r.target ? r.pattern.replace(/:\w+/, ids[r.target]) : r.pattern;

describe('authorization matrix (e2e, PRD §16.2)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let alice: UserDto;
  let bob: UserDto;
  let ids: Ids;
  const server = () => app.getHttpServer();
  const send = (route: Route, path: string, headers: Record<string, string>) => {
    const req = request(server())[route.method](path).set(headers);
    return route.body ? req.send(route.body) : req;
  };
  const outcome = (route: Route, res: request.Response) => ({
    route: label(route),
    status: res.status,
    code: (res.body as { error?: { code?: string } } | undefined)?.error?.code,
  });

  async function seed(): Promise<void> {
    await resetDatabase();
    alice = await syncUser(server(), 'alice');
    bob = await syncUser(server(), 'bob');
    const a = auth(await userToken(alice.id));
    const game = (
      await request(server())
        .post('/internal/games')
        .set(a)
        .send({ name: 'Asteroids', slug: 'asteroids' })
    ).body;
    const board = (
      await request(server())
        .post(`/internal/games/${game.id}/leaderboards`)
        .set(a)
        .send({ name: 'High score', slug: 'high-score', sortOrder: 'DESC' })
    ).body;
    const key = (
      await request(server())
        .post(`/internal/games/${game.id}/keys`)
        .set(a)
        .send({ name: 'prod', scopes: ['scores:read', 'scores:write'], expiresInDays: null })
    ).body;
    ids = { game: game.id, board: board.id, key: key.id };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(seed);

  it('the matrix lists every route the app registers under /internal', () => {
    // Nest registers each handler on the Express 5 router; read the real registrations.
    const router = (app.getHttpAdapter().getInstance() as { router: { stack: unknown[] } }).router;
    const registered: string[] = [];
    for (const layer of router.stack as Array<{
      route?: { path: string; methods: Record<string, boolean> };
    }>) {
      const route = layer.route;
      if (!route || !route.path.startsWith('/internal')) continue;
      for (const method of Object.keys(route.methods)) registered.push(`${method} ${route.path}`);
    }
    const listed = [...resourceRoutes, ...collectionRoutes, ...systemOnlyRoutes].map(label);
    expect(registered.length).toBeGreaterThan(0);
    expect(registered.sort()).toEqual(listed.sort());
  });

  it('user B gets 404 NOT_FOUND on every one of user A’s resources, and nothing changes', async () => {
    const bobAuth = auth(await userToken(bob.id));
    for (const route of resourceRoutes) {
      const res = await send(route, pathFor(route, ids), bobAuth);
      expect(outcome(route, res)).toEqual({ route: label(route), status: 404, code: 'NOT_FOUND' });
    }
    expect(await prisma.game.findUniqueOrThrow({ where: { id: ids.game } })).toMatchObject({
      name: 'Asteroids',
    });
    expect(await prisma.leaderboard.findUniqueOrThrow({ where: { id: ids.board } })).toMatchObject({
      name: 'High score',
    });
    expect(await prisma.leaderboard.count()).toBe(1);
    expect(await prisma.apiKey.count()).toBe(1);
    expect(
      (await prisma.apiKey.findUniqueOrThrow({ where: { id: ids.key } })).revokedAt,
    ).toBeNull();
  });

  it('a foreign id and a nonexistent id are indistinguishable', async () => {
    const bobAuth = auth(await userToken(bob.id));
    const missing: Ids = { game: 'c_missing_game', board: 'c_missing_board', key: 'c_missing_key' };
    for (const route of resourceRoutes) {
      const [f, m] = [
        await send(route, pathFor(route, ids), bobAuth),
        await send(route, pathFor(route, missing), bobAuth),
      ];
      expect({ route: label(route), s: f.status, c: f.body.error.code }).toEqual({
        route: label(route),
        s: m.status,
        c: m.body.error.code,
      });
      expect(f.body.error.message).toBe(m.body.error.message);
    }
  });

  it('every /internal route rejects a missing token with 401 INVALID_SERVICE_TOKEN', async () => {
    for (const route of [...collectionRoutes, ...resourceRoutes, ...systemOnlyRoutes]) {
      const res = await send(route, pathFor(route, ids), {});
      expect(outcome(route, res)).toEqual({
        route: label(route),
        status: 401,
        code: 'INVALID_SERVICE_TOKEN',
      });
    }
  });

  it('every resource and collection route rejects a system token with 401 INVALID_SERVICE_TOKEN', async () => {
    const system = auth(await systemToken());
    for (const route of [...collectionRoutes, ...resourceRoutes]) {
      const res = await send(route, pathFor(route, ids), system);
      expect(outcome(route, res)).toEqual({
        route: label(route),
        status: 401,
        code: 'INVALID_SERVICE_TOKEN',
      });
    }
  });

  it('system-only routes accept the system token and reject a user token with 401', async () => {
    const user = auth(await userToken(alice.id));
    const system = auth(await systemToken());
    for (const route of systemOnlyRoutes) {
      const rejected = await send(route, route.pattern, user);
      expect(outcome(route, rejected)).toEqual({
        route: label(route),
        status: 401,
        code: 'INVALID_SERVICE_TOKEN',
      });
      const accepted = await send(route, route.pattern, system);
      expect({ route: label(route), status: accepted.status }).toEqual({
        route: label(route),
        status: 200,
      });
    }
  });

  it('sanity: the owner is let through every resource and collection route', async () => {
    for (const route of [...collectionRoutes, ...resourceRoutes]) {
      await seed(); // destructive routes consume their target, so start each row fresh
      const res = await send(route, pathFor(route, ids), auth(await userToken(alice.id)));
      expect({
        route: label(route),
        ok: res.status !== 401 && res.status !== 404 && res.status < 300,
      }).toEqual({
        route: label(route),
        ok: true,
      });
    }
  });
});
