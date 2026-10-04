import { generateKeyPairSync } from 'node:crypto';
import type { UserDto } from '@mos/contracts';
import { signServiceToken } from '@mos/service-token';
import request from 'supertest';
import type { App } from 'supertest/types.js';

// Each e2e file gets its own key pair. This must run before createTestApp() loads the env,
// which is guaranteed because test files import this module at the top.
const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
process.env.SERVICE_TOKEN_PUBLIC_KEY = Buffer.from(publicKey).toString('base64');

export const TEST_PRIVATE_KEY = privateKey;

export function userToken(userId: string, opts: { ip?: string; now?: Date } = {}): Promise<string> {
  return signServiceToken(
    privateKey,
    { sub: userId, scope: 'user', ip: opts.ip ?? '203.0.113.10' },
    opts.now,
  );
}

export function systemToken(): Promise<string> {
  return signServiceToken(privateKey, { sub: 'mos-web', scope: 'system' });
}

export function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

export async function syncUser(server: App, login: string): Promise<UserDto> {
  const res = await request(server)
    .post('/internal/users/sync')
    .set(auth(await systemToken()))
    .send({ githubId: `gh-${login}`, login, avatarUrl: null })
    .expect(200);
  return res.body as UserDto;
}
