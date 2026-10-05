import { describe, expect, it } from 'vitest';
import { signInRedirect } from './route-protection';

const origin = 'http://localhost:3000';
const anonymous = { origin, search: '', signedIn: false, method: 'GET' };

describe('signInRedirect (FR-AUTH-4)', () => {
  it('sends an anonymous /dashboard request to /signin with a callbackUrl', () => {
    expect(signInRedirect({ ...anonymous, pathname: '/dashboard' })?.href).toBe(
      `${origin}/signin?callbackUrl=%2Fdashboard`,
    );
  });

  it('keeps nested paths and the query string in the callbackUrl', () => {
    expect(signInRedirect({ ...anonymous, pathname: '/dashboard/x', search: '?y=1' })?.href).toBe(
      `${origin}/signin?callbackUrl=%2Fdashboard%2Fx%3Fy%3D1`,
    );
  });

  it('redirects an anonymous HEAD request like a GET', () => {
    expect(signInRedirect({ ...anonymous, pathname: '/dashboard', method: 'HEAD' })?.href).toBe(
      `${origin}/signin?callbackUrl=%2Fdashboard`,
    );
  });

  it.each(['/dashboard', '/dashboard/x'])('lets a signed-in user through to %s', (pathname) => {
    expect(signInRedirect({ ...anonymous, pathname, signedIn: true })).toBeNull();
  });

  it.each(['/', '/signin', '/dashboardx', '/dashboard-public'])(
    'does not protect %s',
    (pathname) => {
      expect(signInRedirect({ ...anonymous, pathname })).toBeNull();
    },
  );

  // Server Actions are POSTs, with the next-action header (fetch) or without it (no-JS form post).
  // A 307 would replay them against /signin; requireUser() in the page, layout or action answers.
  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
    'lets an anonymous %s through to requireUser()',
    (method) => {
      expect(signInRedirect({ ...anonymous, pathname: '/dashboard', method })).toBeNull();
    },
  );
});
