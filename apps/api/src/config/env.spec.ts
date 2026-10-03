import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const required = {
  DATABASE_URL: 'postgresql://u:p@localhost/db',
  REDIS_URL: 'redis://localhost:6379/0',
  SERVICE_TOKEN_PUBLIC_KEY: 'abc',
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
});
