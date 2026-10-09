import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const ed25519 = generateKeyPairSync('ed25519');
const publicPem = ed25519.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const privatePem = ed25519.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const rsaPublicPem = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .publicKey.export({ type: 'spki', format: 'pem' })
  .toString();
const base64 = (pem: string) => Buffer.from(pem).toString('base64');

const required = {
  DATABASE_URL: 'postgresql://u:p@localhost/db',
  REDIS_URL: 'redis://localhost:6379/0',
  SERVICE_TOKEN_PUBLIC_KEY: base64(publicPem),
};

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv(required);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      LOG_LEVEL: 'info',
      TRUSTED_PROXY_CIDR: 'loopback',
    });
  });
  it('coerces PORT', () => {
    expect(loadEnv({ ...required, PORT: '8080' }).PORT).toBe(8080);
  });
  it('names every missing variable', () => {
    expect(() => loadEnv({})).toThrowError(
      /DATABASE_URL[\s\S]*REDIS_URL[\s\S]*SERVICE_TOKEN_PUBLIC_KEY/,
    );
  });
  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadEnv({ ...required, NODE_ENV: 'staging' })).toThrowError(/NODE_ENV/);
  });

  describe('SERVICE_TOKEN_PUBLIC_KEY', () => {
    it('accepts a PEM public key', () => {
      expect(loadEnv({ ...required, SERVICE_TOKEN_PUBLIC_KEY: publicPem })).toMatchObject({
        SERVICE_TOKEN_PUBLIC_KEY: publicPem,
      });
    });
    it('accepts a PEM public key with literal \\n separators', () => {
      const oneLine = publicPem.trim().replaceAll('\n', '\\n');
      expect(() => loadEnv({ ...required, SERVICE_TOKEN_PUBLIC_KEY: oneLine })).not.toThrow();
    });
    it('accepts a base64 PEM public key', () => {
      expect(() =>
        loadEnv({ ...required, SERVICE_TOKEN_PUBLIC_KEY: base64(publicPem) }),
      ).not.toThrow();
    });

    it('rejects an empty value', () => {
      expect(() => loadEnv({ ...required, SERVICE_TOKEN_PUBLIC_KEY: '' })).toThrowError(
        /SERVICE_TOKEN_PUBLIC_KEY: must be an Ed25519 public key/,
      );
    });

    const rejected: Record<string, string> = {
      'a value that is not base64 or PEM': 'abc',
      'base64 that does not decode to a PEM': base64('hello world'),
      'a PEM that holds no key': '-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----',
      'an RSA public key': rsaPublicPem,
      'a base64 RSA public key': base64(rsaPublicPem),
      'an Ed25519 private key': privatePem,
    };
    it.each(Object.entries(rejected))(
      'rejects %s, naming the variable and not the value',
      (_, v) => {
        let message = '';
        try {
          loadEnv({ ...required, SERVICE_TOKEN_PUBLIC_KEY: v });
        } catch (error) {
          message = (error as Error).message;
        }
        expect(message).toMatch(/SERVICE_TOKEN_PUBLIC_KEY[\s\S]*Ed25519/);
        expect(message).not.toContain(v);
      },
    );
  });
});
