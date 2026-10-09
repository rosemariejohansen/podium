import { generateKeyPairSync } from 'node:crypto';
import type { GameDto } from '@mos/contracts';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserContext } from '@/lib/session';

// session.ts imports next-auth, which Vitest cannot load; games.ts only needs apiAuth from it.
vi.mock('@/lib/session', () => ({
  apiAuth: (ctx: UserContext) => ({ userId: ctx.userId, ip: ctx.ip }),
}));

// Each test is a new request: this clears every memo the stand-in below has made.
const request = vi.hoisted(() => ({ resets: [] as (() => void)[] }));

// React.cache only memoises inside a React Server Components render, so under Vitest it never
// does. This stand-in memoises the way React does: one entry per distinct argument list, with
// each argument compared by identity (Object.is), objects included.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  interface Node {
    children: Map<unknown, Node>;
    result?: { value: unknown };
  }
  const cache = <A extends unknown[], R>(fn: (...args: A) => R) => {
    let root: Node = { children: new Map() };
    request.resets.push(() => {
      root = { children: new Map() };
    });
    return (...args: A): R => {
      let node = root;
      for (const arg of args) {
        let next = node.children.get(arg);
        if (!next) node.children.set(arg, (next = { children: new Map() }));
        node = next;
      }
      node.result ??= { value: fn(...args) };
      return node.result.value as R;
    };
  };
  return { ...actual, cache };
});

const { privateKey } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

let games: typeof import('./games');

beforeAll(async () => {
  process.env.API_URL = 'http://api.test';
  process.env.SERVICE_TOKEN_PRIVATE_KEY = Buffer.from(privateKey).toString('base64');
  games = await import('./games');
});
beforeEach(() => {
  for (const reset of request.resets) reset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const game = (id: string): GameDto => ({
  id,
  name: 'Asteroids',
  slug: 'asteroids',
  description: null,
  isPublic: true,
  createdAt: '2026-10-08T00:00:00.000Z',
  leaderboardCount: 0,
  activeKeyCount: 0,
});

/** Answers every call with the game named by the last path segment. */
function stubFetch() {
  const fn = vi.fn<(url: URL, init?: RequestInit) => Promise<Response>>(async (url) => {
    const id = decodeURIComponent(url.pathname.split('/').at(-1)!);
    return new Response(JSON.stringify(game(id)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
const calledUrls = (fn: ReturnType<typeof stubFetch>) => fn.mock.calls.map(([url]) => String(url));

// requireUser() builds a fresh context object on every call, so a page and its layout never
// share one; the cache has to key on what is inside it.
const ctx = (userId = 'user_1'): UserContext => ({ userId, ip: '198.51.100.4', login: 'octo' });

describe('getGame', () => {
  it('shares one API call between a layout and a page of the same request', async () => {
    const fetchMock = stubFetch();
    const [fromLayout, fromPage] = await Promise.all([
      games.getGame(ctx(), 'g1'),
      games.getGame(ctx(), 'g1'),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calledUrls(fetchMock)).toEqual(['http://api.test/internal/games/g1']);
    expect(fromPage).toEqual(fromLayout);
    expect(fromPage.id).toBe('g1');
  });

  it('shares the call when the context object is the very same one', async () => {
    const fetchMock = stubFetch();
    const shared = ctx();
    await games.getGame(shared, 'g1');
    await games.getGame(shared, 'g1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not share a call between different games', async () => {
    const fetchMock = stubFetch();
    const [first, second] = await Promise.all([
      games.getGame(ctx(), 'g1'),
      games.getGame(ctx(), 'g2'),
    ]);
    // Each call signs its own token asynchronously, so the order the requests leave in is not
    // fixed: compare them as a set.
    expect(calledUrls(fetchMock).sort()).toEqual([
      'http://api.test/internal/games/g1',
      'http://api.test/internal/games/g2',
    ]);
    expect([first.id, second.id]).toEqual(['g1', 'g2']);
  });

  it('does not share a call between different users', async () => {
    const fetchMock = stubFetch();
    await games.getGame(ctx('user_1'), 'g1');
    await games.getGame(ctx('user_2'), 'g1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(['', '.', '..'])('still refuses the path segment %j', async (id) => {
    const fetchMock = stubFetch();
    // getGame may throw synchronously or return a rejected promise; both are a refusal.
    const outcome = await (async () => games.getGame(ctx(), id))().catch((e: unknown) => e);
    expect(outcome).toBeInstanceOf(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('game mutations', () => {
  it('are never memoised', async () => {
    const fetchMock = stubFetch();
    const shared = ctx();
    await games.updateGame(shared, 'g1', { name: 'Renamed' });
    await games.updateGame(shared, 'g1', { name: 'Renamed' });
    await games.deleteGame(shared, 'g1', 'asteroids');
    await games.deleteGame(shared, 'g1', 'asteroids');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual([
      'PATCH',
      'PATCH',
      'DELETE',
      'DELETE',
    ]);
  });
});
