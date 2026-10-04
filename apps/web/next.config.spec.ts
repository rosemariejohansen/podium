import { describe, expect, it } from 'vitest';
import config from './next.config';

describe('next.config security headers (SEC-WEB-4)', () => {
  it('applies HSTS, nosniff, referrer and permissions policies to every route', async () => {
    const rules = await config.headers!();
    const all = rules.find((r) => r.source === '/:path*');
    const headers = Object.fromEntries((all?.headers ?? []).map((h) => [h.key, h.value]));
    expect(headers).toMatchObject({
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
  });
  it('hides the X-Powered-By header', () => {
    expect(config.poweredByHeader).toBe(false);
  });
});
