import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { buildCsp, createNonce, nextWithCsp } from './csp';

const directive = (csp: string, name: string) =>
  csp.split('; ').find((d) => d.startsWith(`${name} `));

describe('buildCsp (SEC-WEB-3)', () => {
  const prod = buildCsp('abc123', false);

  it('allows scripts only by nonce, never unsafe-inline', () => {
    expect(directive(prod, 'script-src')).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
  });
  it('adds unsafe-eval only in development', () => {
    expect(directive(buildCsp('n', true), 'script-src')).toContain("'unsafe-eval'");
    expect(prod).not.toContain('unsafe-eval');
  });
  it('locks down framing, objects, base and form targets', () => {
    expect(directive(prod, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive(prod, 'object-src')).toBe("object-src 'none'");
    expect(directive(prod, 'base-uri')).toBe("base-uri 'self'");
    expect(directive(prod, 'form-action')).toBe("form-action 'self' https://github.com");
  });
  it('allows GitHub avatars', () => {
    expect(directive(prod, 'img-src')).toContain('https://avatars.githubusercontent.com');
  });
});

describe('createNonce', () => {
  it('is unique and base64', () => {
    const a = createNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/=]{20,}$/);
    expect(createNonce()).not.toBe(a);
  });
});

describe('nextWithCsp', () => {
  it('sets a CSP header with a fresh nonce on every response', () => {
    const r1 = nextWithCsp(new NextRequest('http://localhost:3000/'));
    const r2 = nextWithCsp(new NextRequest('http://localhost:3000/'));
    const n1 = /'nonce-([^']+)'/.exec(r1.headers.get('content-security-policy') ?? '')?.[1];
    const n2 = /'nonce-([^']+)'/.exec(r2.headers.get('content-security-policy') ?? '')?.[1];
    expect(n1).toBeTruthy();
    expect(n1).not.toBe(n2);
  });
});
