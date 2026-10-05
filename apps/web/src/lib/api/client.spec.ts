import { generateKeyPairSync } from 'node:crypto';
import { verifyServiceToken } from '@mos/service-token';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

let apiFetch: typeof import('./client').apiFetch;
let ApiError: typeof import('./client').ApiError;

beforeAll(async () => {
  process.env.API_URL = 'http://api.test';
  process.env.SERVICE_TOKEN_PRIVATE_KEY = Buffer.from(privateKey).toString('base64');
  ({ apiFetch, ApiError } = await import('./client'));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubFetch(response: Response | Error) {
  const fn = vi.fn<(url: URL, init: RequestInit) => Promise<Response>>(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const sentInit = (fn: ReturnType<typeof stubFetch>) => fn.mock.calls[0]![1];
const sentHeaders = (fn: ReturnType<typeof stubFetch>) =>
  sentInit(fn).headers as Record<string, string>;

describe('apiFetch', () => {
  it('signs a user token carrying the user id and client ip', async () => {
    const fetchMock = stubFetch(json(200, { ok: true }));
    await expect(
      apiFetch('/internal/me', { auth: { userId: 'user_1', ip: '198.51.100.4' } }),
    ).resolves.toEqual({ ok: true });
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('http://api.test/internal/me');
    const token = sentHeaders(fetchMock).Authorization!.replace('Bearer ', '');
    expect(await verifyServiceToken(publicKey, token)).toMatchObject({
      sub: 'user_1',
      scope: 'user',
      ip: '198.51.100.4',
    });
  });

  it('signs a system token', async () => {
    const fetchMock = stubFetch(json(200, {}));
    await apiFetch('/internal/users/sync', { method: 'POST', body: { a: 1 }, auth: 'system' });
    const token = sentHeaders(fetchMock).Authorization!.replace('Bearer ', '');
    expect(await verifyServiceToken(publicKey, token)).toMatchObject({
      sub: 'mos-web',
      scope: 'system',
    });
    expect(sentHeaders(fetchMock)['Content-Type']).toBe('application/json');
    expect(sentInit(fetchMock)).toMatchObject({
      method: 'POST',
      body: '{"a":1}',
      cache: 'no-store',
    });
  });

  it('sends no Authorization header for public calls', async () => {
    const fetchMock = stubFetch(json(200, {}));
    await apiFetch('/public/games/demo', { auth: 'none' });
    expect(sentHeaders(fetchMock).Authorization).toBeUndefined();
    expect(sentHeaders(fetchMock)['Content-Type']).toBeUndefined();
    expect(sentInit(fetchMock)).toMatchObject({ method: 'GET', body: undefined });
  });

  it('returns undefined for 204', async () => {
    stubFetch(new Response(null, { status: 204 }));
    await expect(
      apiFetch('/internal/keys/k1', { method: 'DELETE', auth: 'system' }),
    ).resolves.toBeUndefined();
  });

  it('turns an error body into ApiError', async () => {
    const details = { issues: [{ path: 'name', message: 'Too long' }] };
    stubFetch(
      json(409, {
        error: { code: 'SLUG_TAKEN', message: 'Slug taken', details, requestId: 'req_9' },
      }),
    );
    await expect(
      apiFetch('/internal/games', { method: 'POST', body: {}, auth: 'system' }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      code: 'SLUG_TAKEN',
      message: 'Slug taken',
      details,
      requestId: 'req_9',
    });
  });

  it('handles a non-JSON error page', async () => {
    stubFetch(new Response('<html>Bad gateway</html>', { status: 502 }));
    const error = await apiFetch('/internal/me', { auth: 'system' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 502, code: 'INTERNAL_ERROR' });
    expect((error as Error).cause).toBeInstanceOf(SyntaxError);
  });

  it('maps a network failure to SERVICE_UNAVAILABLE and keeps the cause', async () => {
    const cause = new TypeError('fetch failed');
    stubFetch(cause);
    const error = await apiFetch('/internal/me', { auth: 'system' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'The API is unreachable',
      cause,
    });
  });

  it('maps a failed body read to SERVICE_UNAVAILABLE', async () => {
    const cause = new TypeError('terminated');
    const body = new ReadableStream({ pull: (controller) => controller.error(cause) });
    stubFetch(new Response(body, { status: 200 }));
    const error = await apiFetch('/internal/me', { auth: 'system' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE', cause });
  });

  it('gives up after 10 seconds with SERVICE_UNAVAILABLE', async () => {
    const timer = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timer.signal);
    const fetchMock = vi.fn(
      (_url: URL, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal!.addEventListener('abort', () => reject(init.signal!.reason));
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const pending = apiFetch('/internal/me', { auth: 'system' }).catch((e: unknown) => e);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(timeout).toHaveBeenCalledWith(10_000);
    expect(fetchMock.mock.calls[0]![1].signal).toBe(timer.signal);
    const cause = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    timer.abort(cause);

    const error = await pending;
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'The API did not respond in time',
      cause,
    });
  });

  it.each([
    'internal/me',
    '//evil.example/internal/me',
    'https://evil.example/internal/me',
    '/\\evil.example/internal/me',
    '/\t/evil.example/internal/me',
  ])('refuses the path %j before sending anything', async (path) => {
    const fetchMock = stubFetch(json(200, {}));
    const error = await apiFetch(path, { auth: 'system' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TypeError);
    expect(error).not.toBeInstanceOf(ApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a body that cannot be serialised as a programmer error, not an outage', async () => {
    const fetchMock = stubFetch(json(200, {}));
    const error = await apiFetch('/internal/games', {
      method: 'POST',
      body: { n: BigInt(1) },
      auth: 'system',
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
