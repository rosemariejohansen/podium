import { generateKeyPairSync } from 'node:crypto';
import type { ApiKeyCreatedDto, ApiKeyDto } from '@mos/contracts';
import { verifyServiceToken } from '@mos/service-token';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { UserContext } from '@/lib/session';

// session.ts imports next-auth, which Vitest cannot load; keys.ts only needs apiAuth from it.
vi.mock('@/lib/session', () => ({
  apiAuth: (ctx: UserContext) => ({ userId: ctx.userId, ip: ctx.ip }),
}));

const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

let keys: typeof import('./keys');

beforeAll(async () => {
  process.env.API_URL = 'http://api.test';
  process.env.SERVICE_TOKEN_PRIVATE_KEY = Buffer.from(privateKey).toString('base64');
  keys = await import('./keys');
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const ctx: UserContext = { userId: 'user_1', ip: '198.51.100.4', login: 'octo' };

const keyDto: ApiKeyDto = {
  id: 'k1',
  gameId: 'g1',
  name: 'prod',
  prefix: 'mos_abcd1234',
  scopes: ['scores:read', 'scores:write'],
  status: 'active',
  createdAt: '2026-10-09T00:00:00.000Z',
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
};
const created: ApiKeyCreatedDto = { ...keyDto, key: 'mos_secret-shown-once' };

function stubFetch(body: unknown) {
  const fn = vi.fn<(url: URL, init?: RequestInit) => Promise<Response>>(
    async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}
const sent = (fn: ReturnType<typeof stubFetch>) => {
  const [url, init] = fn.mock.calls[0]!;
  return { url: String(url), init: init as RequestInit };
};
const bearer = (init: RequestInit) =>
  (init.headers as Record<string, string>).Authorization!.replace('Bearer ', '');

describe('listKeys', () => {
  it("GETs the game's keys as the signed-in user", async () => {
    const fetchMock = stubFetch([keyDto]);
    await expect(keys.listKeys(ctx, 'g1')).resolves.toEqual([keyDto]);
    const { url, init } = sent(fetchMock);
    expect(url).toBe('http://api.test/internal/games/g1/keys');
    expect(init.method).toBe('GET');
    expect(await verifyServiceToken(publicKey, bearer(init))).toMatchObject({
      sub: 'user_1',
      scope: 'user',
      ip: '198.51.100.4',
    });
  });
});

describe('createKey', () => {
  it('POSTs the input and returns the created key with its plaintext', async () => {
    const fetchMock = stubFetch(created);
    const input = { name: 'prod', scopes: ['scores:read' as const], expiresInDays: 90 as const };
    await expect(keys.createKey(ctx, 'g1', input)).resolves.toEqual(created);
    const { url, init } = sent(fetchMock);
    expect(url).toBe('http://api.test/internal/games/g1/keys');
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify(input), cache: 'no-store' });
    expect(await verifyServiceToken(publicKey, bearer(init))).toMatchObject({ sub: 'user_1' });
  });
});

describe('revokeKey', () => {
  it('DELETEs the key by id', async () => {
    const fetchMock = stubFetch({
      ...keyDto,
      status: 'revoked',
      revokedAt: '2026-10-09T01:00:00.000Z',
    });
    await expect(keys.revokeKey(ctx, 'k1')).resolves.toMatchObject({ id: 'k1', status: 'revoked' });
    const { url, init } = sent(fetchMock);
    expect(url).toBe('http://api.test/internal/keys/k1');
    expect(init.method).toBe('DELETE');
    expect(await verifyServiceToken(publicKey, bearer(init))).toMatchObject({ sub: 'user_1' });
  });
});

// Ids reach these wrappers from the URL and from bound Server Action arguments, so they are
// client-controlled: every one has to go through pathSegment().
describe('path segments', () => {
  it('encodes ids that would change the path or query', async () => {
    const fetchMock = stubFetch([]);
    await keys.listKeys(ctx, 'a/b?c#d');
    expect(sent(fetchMock).url).toBe('http://api.test/internal/games/a%2Fb%3Fc%23d/keys');

    const revokeMock = stubFetch(keyDto);
    await keys.revokeKey(ctx, '../games/g1');
    expect(sent(revokeMock).url).toBe('http://api.test/internal/keys/..%2Fgames%2Fg1');
  });

  const calls: [string, (id: string) => Promise<unknown>][] = [
    ['listKeys', (id) => keys.listKeys(ctx, id)],
    [
      'createKey',
      (id) =>
        keys.createKey(ctx, id, { name: 'prod', scopes: ['scores:read'], expiresInDays: null }),
    ],
    ['revokeKey', (id) => keys.revokeKey(ctx, id)],
  ];
  it.each(calls.flatMap(([name, call]) => ['', '.', '..'].map((id) => [name, id, call] as const)))(
    '%s refuses the id %j before sending anything',
    async (_name, id, call) => {
      const fetchMock = stubFetch({});
      // The wrapper may throw synchronously or return a rejected promise; both are a refusal.
      const outcome = await (async () => call(id))().catch((e: unknown) => e);
      expect(outcome).toBeInstanceOf(TypeError);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([[['..']], [123], [null], [undefined]])(
    'refuses the non-string id %j at runtime',
    async (id) => {
      const fetchMock = stubFetch({});
      const outcome = await (async () => keys.revokeKey(ctx, id as unknown as string))().catch(
        (e: unknown) => e,
      );
      expect(outcome).toBeInstanceOf(TypeError);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
