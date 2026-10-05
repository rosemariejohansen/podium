import { describe, expect, it } from 'vitest';
import { safeRedirect } from './safe-redirect';

describe('safeRedirect', () => {
  it.each(['/dashboard/x', '/dashboard?tab=1', '/'])('keeps the same-origin path %s', (path) => {
    expect(safeRedirect(path)).toBe(path);
  });

  it.each([
    '//evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    '/dashboard\\x',
    '/dash board',
    '/dashboard\u0000',
    'https://evil.example',
    'dashboard',
    '',
    '/..//evil.example',
    '/.//evil.example',
    '/%2e//evil.example',
    '/%2e%2e//evil.example',
    '/dashboard/..//evil.example',
  ])('falls back to /dashboard for %j', (callbackUrl) => {
    expect(safeRedirect(callbackUrl)).toBe('/dashboard');
  });

  it('returns the normalised path, query and fragment', () => {
    expect(safeRedirect('/dashboard/../dashboard/x?y=1#z')).toBe('/dashboard/x?y=1#z');
  });

  it('falls back to /dashboard when the value is missing or repeated', () => {
    expect(safeRedirect(undefined)).toBe('/dashboard');
    expect(safeRedirect(['/a', '/b'])).toBe('/dashboard');
  });
});
