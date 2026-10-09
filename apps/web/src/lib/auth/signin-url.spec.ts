import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { nextWithCsp } from '@/lib/csp';
import { REQUEST_PATH_HEADER, signInPath } from './signin-url';

const callbackOf = (signInUrl: string) =>
  new URL(signInUrl, 'http://localhost:3000').searchParams.get('callbackUrl');

describe('signInPath (requireUser callbackUrl)', () => {
  it('returns the user to the page they were on', () => {
    expect(signInPath('/dashboard/games/g1/keys')).toBe(
      '/signin?callbackUrl=%2Fdashboard%2Fgames%2Fg1%2Fkeys',
    );
  });

  it('keeps the query string', () => {
    const url = signInPath('/dashboard/games?page=2&q=a%20b');
    expect(url.startsWith('/signin?callbackUrl=')).toBe(true);
    expect(callbackOf(url)).toBe('/dashboard/games?page=2&q=a%20b');
  });

  it('keeps an exact /dashboard (the same encoding as the proxy redirect)', () => {
    expect(signInPath('/dashboard')).toBe('/signin?callbackUrl=%2Fdashboard');
  });

  it.each([null, undefined, ''])('goes to plain /signin when the header is %j', (value) => {
    expect(signInPath(value)).toBe('/signin');
  });

  // A client may send the header itself on a request the proxy skips (prefetches, excluded
  // paths); safeRedirect keeps whatever it carries on this origin.
  it.each([
    '//evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    '/dash board',
    '/dashboard\u0000',
    'https://evil.example/dashboard',
    'dashboard',
    '/..//evil.example',
    '/dashboard/..//evil.example',
  ])('goes to plain /signin for the unsafe value %j', (value) => {
    expect(signInPath(value)).toBe('/signin');
  });

  it('encodes the whole path, so a URL in the query stays data', () => {
    const url = signInPath('/dashboard/x?next=https://evil.example&a=1');
    expect(url).toMatch(/^\/signin\?callbackUrl=%2Fdashboard%2Fx%3Fnext%3Dhttps/);
    expect([...new URL(url, 'http://localhost:3000').searchParams.keys()]).toEqual(['callbackUrl']);
    expect(callbackOf(url)).toBe('/dashboard/x?next=https://evil.example&a=1');
  });
});

describe('nextWithCsp request path header', () => {
  // NextResponse.next({ request: { headers } }) reports the forwarded request headers as
  // x-middleware-request-<name> on the response.
  const forwarded = (response: Response, name: string) =>
    response.headers.get(`x-middleware-request-${name}`);

  it('forwards the pathname and search to the app', () => {
    const request = new NextRequest('http://localhost:3000/dashboard/x?y=1');
    const response = nextWithCsp(request, { [REQUEST_PATH_HEADER]: '/dashboard/x?y=1' });
    expect(forwarded(response, REQUEST_PATH_HEADER)).toBe('/dashboard/x?y=1');
  });

  it('overwrites a header the client sent itself', () => {
    const request = new NextRequest('http://localhost:3000/dashboard/x', {
      headers: { [REQUEST_PATH_HEADER]: '//evil.example' },
    });
    const response = nextWithCsp(request, { [REQUEST_PATH_HEADER]: '/dashboard/x' });
    expect(forwarded(response, REQUEST_PATH_HEADER)).toBe('/dashboard/x');
  });

  it('keeps the nonce and CSP forwarded to the app unchanged', () => {
    const request = new NextRequest('http://localhost:3000/dashboard');
    const response = nextWithCsp(request, { [REQUEST_PATH_HEADER]: '/dashboard' });
    const csp = response.headers.get('content-security-policy') ?? '';
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(forwarded(response, 'x-nonce')).toBe(nonce);
    expect(forwarded(response, 'content-security-policy')).toBe(csp);
  });

  it('still works without extra headers', () => {
    const response = nextWithCsp(new NextRequest('http://localhost:3000/'));
    expect(forwarded(response, REQUEST_PATH_HEADER)).toBeNull();
    expect(forwarded(response, 'x-nonce')).toBeTruthy();
  });
});
