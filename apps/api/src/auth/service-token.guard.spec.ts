import { generateKeyPairSync } from 'node:crypto';
import { type ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { signServiceToken } from '@mos/service-token';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../common/errors/app-exception.js';
import type { Env } from '../config/env.js';
import { ServiceTokenGuard } from './service-token.guard.js';

function keyPair() {
  return generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
}

const trusted = keyPair();
const other = keyPair();
const env = {
  SERVICE_TOKEN_PUBLIC_KEY: Buffer.from(trusted.publicKey).toString('base64'),
} as Env;

function context(authorization: string | undefined, id = 'req_abc123'): ExecutionContext {
  const req = {
    id,
    header: (name: string) => (name.toLowerCase() === 'authorization' ? authorization : undefined),
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => () => undefined,
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

describe('ServiceTokenGuard', () => {
  const guard = new ServiceTokenGuard(env, new Reflector());
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const userClaims = { sub: 'user-1', scope: 'user' } as const;

  it('accepts a valid token without logging', async () => {
    const token = await signServiceToken(trusted.privateKey, userClaims);
    await expect(guard.canActivate(context(`Bearer ${token}`))).resolves.toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns with the reason and the request id when the signature is wrong, never the token', async () => {
    const token = await signServiceToken(other.privateKey, userClaims);
    await expect(guard.canActivate(context(`Bearer ${token}`, 'req_sig'))).rejects.toMatchObject({
      code: 'INVALID_SERVICE_TOKEN',
      message: 'Invalid service token',
    });
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0]?.[0]);
    expect(line).toContain('req_sig');
    expect(line).toMatch(/signature verification failed/i);
    expect(line).not.toContain(token);
    expect(line).not.toContain(token.split('.')[1] ?? 'missing-payload');
  });

  it('warns with the reason when the token has expired', async () => {
    const token = await signServiceToken(
      trusted.privateKey,
      userClaims,
      new Date(Date.now() - 10 * 60_000),
    );
    await expect(guard.canActivate(context(`Bearer ${token}`, 'req_exp'))).rejects.toBeInstanceOf(
      AppException,
    );
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0]?.[0]);
    expect(line).toContain('req_exp');
    expect(line).toMatch(/exp/);
  });

  it('warns for a malformed token', async () => {
    await expect(guard.canActivate(context('Bearer not.a.jwt'))).rejects.toMatchObject({
      code: 'INVALID_SERVICE_TOKEN',
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, '', 'Basic abc', 'Bearer', 'Bearer a b'])(
    'does not log when the bearer header is absent or unusable (%j)',
    async (header) => {
      await expect(guard.canActivate(context(header))).rejects.toMatchObject({
        code: 'INVALID_SERVICE_TOKEN',
        message: 'Missing service token',
      });
      expect(warn).not.toHaveBeenCalled();
    },
  );
});
