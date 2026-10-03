import { randomUUID } from 'node:crypto';
import { importPKCS8, importSPKI, jwtVerify, SignJWT } from 'jose';

export const SERVICE_TOKEN_ISSUER = 'mos-web';
export const SERVICE_TOKEN_AUDIENCE = 'mos-api';
export const SERVICE_TOKEN_TTL_SECONDS = 60;
export const SERVICE_TOKEN_CLOCK_SKEW_SECONDS = 5;
const ALG = 'EdDSA';

export type ServiceTokenScope = 'user' | 'system';

export interface ServiceTokenClaims {
  sub: string;
  scope: ServiceTokenScope;
  ip?: string | null;
}

export interface VerifiedServiceToken {
  sub: string;
  scope: ServiceTokenScope;
  ip: string | null;
  jti: string;
}

export class ServiceTokenError extends Error {
  override name = 'ServiceTokenError';
}

/** Env vars hold base64-encoded PEM (one line); raw PEM, also with literal "\n", is accepted too. */
export function decodePem(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('-----BEGIN')) return trimmed.replaceAll('\\n', '\n');
  return Buffer.from(trimmed, 'base64').toString('utf8');
}

type ImportedKey = Awaited<ReturnType<typeof importSPKI>>;
// Bounded only because keys come from config, never from tokens.
const keyCache = new Map<string, Promise<ImportedKey>>();

function cachedKey(kind: 'private' | 'public', value: string): Promise<ImportedKey> {
  const cacheKey = `${kind}:${value}`;
  let key = keyCache.get(cacheKey);
  if (!key) {
    const pem = decodePem(value);
    key = kind === 'private' ? importPKCS8(pem, ALG) : importSPKI(pem, ALG);
    keyCache.set(cacheKey, key);
  }
  return key;
}

/** The system scope belongs to the web server itself; user tokens must never claim its identity. */
function assertScopeSubject(scope: ServiceTokenScope, sub: string): void {
  if (scope === 'system' && sub !== SERVICE_TOKEN_ISSUER) {
    throw new ServiceTokenError('System scope requires the web subject');
  }
  if (scope === 'user' && sub === SERVICE_TOKEN_ISSUER) {
    throw new ServiceTokenError('User scope cannot use the web subject');
  }
}

export async function signServiceToken(
  privateKey: string,
  claims: ServiceTokenClaims,
  now: Date = new Date(),
): Promise<string> {
  assertScopeSubject(claims.scope, claims.sub);
  const key = await cachedKey('private', privateKey);
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({ scope: claims.scope, ...(claims.ip ? { ip: claims.ip } : {}) })
    .setProtectedHeader({ alg: ALG, typ: 'JWT' })
    .setIssuer(SERVICE_TOKEN_ISSUER)
    .setAudience(SERVICE_TOKEN_AUDIENCE)
    .setSubject(claims.sub)
    .setJti(randomUUID())
    .setIssuedAt(iat)
    .setExpirationTime(iat + SERVICE_TOKEN_TTL_SECONDS)
    .sign(key);
}

export async function verifyServiceToken(
  publicKey: string,
  token: string,
  now: Date = new Date(),
): Promise<VerifiedServiceToken> {
  try {
    const key = await cachedKey('public', publicKey);
    const { payload } = await jwtVerify(token, key, {
      issuer: SERVICE_TOKEN_ISSUER,
      audience: SERVICE_TOKEN_AUDIENCE,
      algorithms: [ALG],
      clockTolerance: SERVICE_TOKEN_CLOCK_SKEW_SECONDS,
      currentDate: now,
      requiredClaims: ['sub', 'jti', 'iat', 'exp'],
    });
    const { sub, jti, iat, exp, scope, ip } = payload;
    const nowSeconds = Math.floor(now.getTime() / 1000);
    if (typeof sub !== 'string' || sub === '') throw new ServiceTokenError('Invalid sub claim');
    if (typeof jti !== 'string' || jti === '') throw new ServiceTokenError('Invalid jti claim');
    if (scope !== 'user' && scope !== 'system') throw new ServiceTokenError('Invalid scope claim');
    if (typeof iat !== 'number' || typeof exp !== 'number') {
      throw new ServiceTokenError('Invalid iat/exp claims');
    }
    assertScopeSubject(scope, sub);
    if (iat > nowSeconds + SERVICE_TOKEN_CLOCK_SKEW_SECONDS) {
      throw new ServiceTokenError('Token issued in the future');
    }
    // Written so NaN fails closed.
    if (!(exp - iat <= SERVICE_TOKEN_TTL_SECONDS)) {
      throw new ServiceTokenError('Token lifetime too long');
    }
    return { sub, scope, ip: typeof ip === 'string' ? ip : null, jti };
  } catch (error) {
    if (error instanceof ServiceTokenError) throw error;
    throw new ServiceTokenError(error instanceof Error ? error.message : 'Invalid service token');
  }
}
