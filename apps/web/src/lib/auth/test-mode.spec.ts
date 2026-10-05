import { describe, expect, it } from 'vitest';
import { isTestModeEnabled } from './test-mode';

describe('isTestModeEnabled (SEC-WEB-9)', () => {
  it('is off by default', () => {
    expect(isTestModeEnabled({})).toBe(false);
    expect(isTestModeEnabled({ AUTH_TEST_MODE: '0' })).toBe(false);
  });
  it('is on locally and in CI, including production builds', () => {
    expect(isTestModeEnabled({ AUTH_TEST_MODE: '1' })).toBe(true);
    expect(isTestModeEnabled({ AUTH_TEST_MODE: '1', NODE_ENV: 'production' })).toBe(true);
  });
  it.each(['production', 'preview'])('refuses to start on a Vercel %s deployment', (VERCEL_ENV) => {
    expect(() => isTestModeEnabled({ AUTH_TEST_MODE: '1', VERCEL_ENV })).toThrow(/not allowed/);
  });
  it('does not throw on Vercel when test mode is off', () => {
    expect(isTestModeEnabled({ AUTH_TEST_MODE: '0', VERCEL_ENV: 'production' })).toBe(false);
  });
});
