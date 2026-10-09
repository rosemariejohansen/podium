import { createPublicKey, generateKeyPairSync, randomUUID } from 'node:crypto';
import { importPKCS8, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { decodePem, ServiceTokenError, signServiceToken, verifyServiceToken } from './index.js';

function keyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return { privateKey, publicKey };
}
const { privateKey, publicKey } = keyPair();
const b64 = (s: string) => Buffer.from(s).toString('base64');
const T = new Date('2026-10-03T12:00:00Z');
const at = (seconds: number) => new Date(T.getTime() + seconds * 1000);

interface ForgeOpts {
  iss?: string;
  aud?: string;
  iat?: number;
  exp?: number;
  /** JOSE `typ` header; defaults to 'JWT' like the signer. `null` leaves it out of the header. */
  typ?: string | null;
  /** Claims to leave out of the token entirely. */
  omit?: string[];
  /** Arbitrary claim overrides (e.g. sub, jti), applied last. */
  claims?: Record<string, unknown>;
}

async function forge(payload: Record<string, unknown>, opts: ForgeOpts = {}) {
  const key = await importPKCS8(privateKey, 'EdDSA');
  const iat = opts.iat ?? Math.floor(T.getTime() / 1000);
  const body: Record<string, unknown> = {
    ...payload,
    iss: opts.iss ?? 'mos-web',
    aud: opts.aud ?? 'mos-api',
    sub: 'u1',
    jti: randomUUID(),
    iat,
    exp: opts.exp ?? iat + 60,
    ...opts.claims,
  };
  for (const claim of opts.omit ?? []) delete body[claim];
  const typ = opts.typ === undefined ? 'JWT' : opts.typ;
  return new SignJWT(body)
    .setProtectedHeader({ alg: 'EdDSA', ...(typ === null ? {} : { typ }) })
    .sign(key);
}

/** The allow-list's own rejection; without `algorithms: [ALG]` jose still refuses but for other reasons. */
const ALG_NOT_ALLOWED = /"alg" \(Algorithm\) Header Parameter value not allowed/;

const base64url = (value: string | Uint8Array) => Buffer.from(value).toString('base64url');

/** Claims that pass every check, so a rejection can only come from the header under test. */
function validClaims(): Record<string, unknown> {
  const iat = Math.floor(T.getTime() / 1000);
  return {
    iss: 'mos-web',
    aud: 'mos-api',
    sub: 'u1',
    scope: 'user',
    jti: randomUUID(),
    iat,
    exp: iat + 60,
  };
}

describe('decodePem', () => {
  it('accepts raw PEM, PEM with literal \\n, and base64 PEM', () => {
    expect(decodePem(publicKey)).toBe(publicKey.trim());
    expect(decodePem(publicKey.trim().replaceAll('\n', '\\n'))).toBe(publicKey.trim());
    expect(decodePem(b64(publicKey))).toBe(publicKey);
  });
});

describe('sign/verify', () => {
  it('round-trips user claims (base64 keys)', async () => {
    const token = await signServiceToken(
      b64(privateKey),
      { sub: 'user_1', scope: 'user', ip: '203.0.113.7' },
      T,
    );
    const verified = await verifyServiceToken(b64(publicKey), token, T);
    expect(verified).toEqual({
      sub: 'user_1',
      scope: 'user',
      ip: '203.0.113.7',
      jti: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });

  it('round-trips a system token without ip', async () => {
    const token = await signServiceToken(privateKey, { sub: 'mos-web', scope: 'system' }, T);
    expect(await verifyServiceToken(publicKey, token, T)).toMatchObject({
      scope: 'system',
      ip: null,
    });
  });

  it('tolerates 5 s of skew', async () => {
    const token = await signServiceToken(privateKey, { sub: 'u', scope: 'user' }, T);
    await expect(verifyServiceToken(publicKey, token, at(64))).resolves.toBeTruthy(); // expired 4 s ago
    const early = await signServiceToken(privateKey, { sub: 'u', scope: 'user' }, at(3));
    await expect(verifyServiceToken(publicKey, early, T)).resolves.toBeTruthy(); // issued 3 s "in the future"
  });

  it('rejects beyond skew', async () => {
    const token = await signServiceToken(privateKey, { sub: 'u', scope: 'user' }, T);
    await expect(verifyServiceToken(publicKey, token, at(66))).rejects.toBeInstanceOf(
      ServiceTokenError,
    );
    const future = await signServiceToken(privateKey, { sub: 'u', scope: 'user' }, at(10));
    await expect(verifyServiceToken(publicKey, future, T)).rejects.toBeInstanceOf(
      ServiceTokenError,
    );
  });

  it('rejects a token signed by another key', async () => {
    const other = keyPair();
    const token = await signServiceToken(other.privateKey, { sub: 'u', scope: 'user' }, T);
    await expect(verifyServiceToken(publicKey, token, T)).rejects.toBeInstanceOf(ServiceTokenError);
  });

  it.each([
    ['wrong issuer', { iss: 'evil' }],
    ['wrong audience', { aud: 'other-api' }],
  ])('rejects %s', async (_label, opts) => {
    const token = await forge({ scope: 'user' }, opts);
    await expect(verifyServiceToken(publicKey, token, T)).rejects.toBeInstanceOf(ServiceTokenError);
  });

  it('rejects an unknown scope', async () => {
    const token = await forge({ scope: 'admin' });
    await expect(verifyServiceToken(publicKey, token, T)).rejects.toThrow(/scope/);
  });

  it('rejects a lifetime longer than 60 s', async () => {
    const iat = Math.floor(T.getTime() / 1000);
    const token = await forge({ scope: 'user' }, { iat, exp: iat + 3600 });
    await expect(verifyServiceToken(publicKey, token, T)).rejects.toThrow(/lifetime/);
  });

  it('rejects HS256 and garbage tokens', async () => {
    const hs = await new SignJWT({ scope: 'user' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('mos-web')
      .setAudience('mos-api')
      .setSubject('u')
      .setJti(randomUUID())
      .setIssuedAt(Math.floor(T.getTime() / 1000))
      .setExpirationTime('60s')
      .sign(new TextEncoder().encode('x'.repeat(32)));
    await expect(verifyServiceToken(publicKey, hs, T)).rejects.toBeInstanceOf(ServiceTokenError);
    await expect(verifyServiceToken(publicKey, 'not.a.jwt', T)).rejects.toBeInstanceOf(
      ServiceTokenError,
    );
  });

  it('rejects a token without a typ header, or with typ at+jwt', async () => {
    // Control: identical claims with typ JWT verify, so only the header differs below.
    await expect(
      verifyServiceToken(publicKey, await forge({ scope: 'user' }), T),
    ).resolves.toBeTruthy();
    for (const typ of [null, 'at+jwt']) {
      const token = await forge({ scope: 'user' }, { typ });
      await expect(verifyServiceToken(publicKey, token, T)).rejects.toThrow(/typ/);
    }
  });

  it('rejects an unsigned alg:none token with otherwise valid claims', async () => {
    const header = base64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
    const payload = base64url(JSON.stringify(validClaims()));
    await expect(verifyServiceToken(publicKey, `${header}.${payload}.`, T)).rejects.toThrow(
      ALG_NOT_ALLOWED,
    );
    // Dropping the empty signature segment altogether is malformed, and must not be accepted either.
    await expect(verifyServiceToken(publicKey, `${header}.${payload}`, T)).rejects.toBeInstanceOf(
      ServiceTokenError,
    );
  });

  it.each([
    ['the public key PEM bytes', () => new TextEncoder().encode(publicKey)],
    [
      'the public key DER bytes',
      () => createPublicKey(publicKey).export({ type: 'spki', format: 'der' }),
    ],
  ])('rejects an HS256 token signed with %s (algorithm confusion)', async (_label, secret) => {
    const token = await new SignJWT(validClaims())
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .sign(new Uint8Array(secret()));
    await expect(verifyServiceToken(publicKey, token, T)).rejects.toThrow(ALG_NOT_ALLOWED);
  });

  it.each(['exp', 'iat', 'sub', 'jti'])('rejects a token without %s', async (claim) => {
    const token = await forge({ scope: 'user' }, { omit: [claim] });
    await expect(verifyServiceToken(publicKey, token, T)).rejects.toBeInstanceOf(ServiceTokenError);
  });

  it('pins the exp leeway edge: accepted at T+64, rejected at T+65', async () => {
    const token = await signServiceToken(privateKey, { sub: 'u', scope: 'user' }, T);
    await expect(verifyServiceToken(publicKey, token, at(64))).resolves.toBeTruthy();
    await expect(verifyServiceToken(publicKey, token, at(65))).rejects.toBeInstanceOf(
      ServiceTokenError,
    );
  });

  it('pins the future-iat edge: T+5 accepted, T+6 rejected', async () => {
    const t = Math.floor(T.getTime() / 1000);
    const ok = await forge({ scope: 'user' }, { iat: t + 5, exp: t + 65 });
    await expect(verifyServiceToken(publicKey, ok, T)).resolves.toBeTruthy();
    const bad = await forge({ scope: 'user' }, { iat: t + 6, exp: t + 66 });
    await expect(verifyServiceToken(publicKey, bad, T)).rejects.toBeInstanceOf(ServiceTokenError);
  });

  it('pins the lifetime edge: 60 s accepted, 61 s rejected', async () => {
    const t = Math.floor(T.getTime() / 1000);
    const ok = await forge({ scope: 'user' }, { exp: t + 60 });
    await expect(verifyServiceToken(publicKey, ok, T)).resolves.toBeTruthy();
    const bad = await forge({ scope: 'user' }, { exp: t + 61 });
    await expect(verifyServiceToken(publicKey, bad, T)).rejects.toThrow(/lifetime/);
  });

  it.each([
    ['numeric sub', { sub: 42 }],
    ['empty sub', { sub: '' }],
    ['object jti', { jti: {} }],
    ['empty jti', { jti: '' }],
  ])('rejects %s', async (_label, claims) => {
    const token = await forge({ scope: 'user' }, { claims });
    await expect(verifyServiceToken(publicKey, token, T)).rejects.toBeInstanceOf(ServiceTokenError);
  });
});

describe('scope/subject binding', () => {
  it('refuses to sign a system token for a non-web subject', async () => {
    await expect(
      signServiceToken(privateKey, { sub: 'user_1', scope: 'system' }, T),
    ).rejects.toBeInstanceOf(ServiceTokenError);
  });

  it('refuses to sign a user token for the web subject', async () => {
    await expect(
      signServiceToken(privateKey, { sub: 'mos-web', scope: 'user' }, T),
    ).rejects.toBeInstanceOf(ServiceTokenError);
  });

  it('rejects a forged system token with a user subject', async () => {
    const token = await forge({ scope: 'system' }, { claims: { sub: 'user_1' } });
    await expect(verifyServiceToken(publicKey, token, T)).rejects.toBeInstanceOf(ServiceTokenError);
  });

  it('rejects a forged user token with the web subject', async () => {
    const token = await forge({ scope: 'user' }, { claims: { sub: 'mos-web' } });
    await expect(verifyServiceToken(publicKey, token, T)).rejects.toBeInstanceOf(ServiceTokenError);
  });
});
