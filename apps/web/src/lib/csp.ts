import { type NextRequest, NextResponse } from 'next/server';

export function createNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString('base64');
}

/** PRD SEC-WEB-3. Styles allow 'unsafe-inline' because Radix sets style attributes; scripts never do. */
export function buildCsp(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://avatars.githubusercontent.com",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://github.com",
    "object-src 'none'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

/**
 * Continues the request with a per-request nonce. Next.js reads the nonce from the request's
 * CSP header and applies it to its own scripts, so every page must render dynamically.
 * `extraRequestHeaders` are set (overwriting any value the client sent) on the request the app sees.
 */
export function nextWithCsp(
  request: NextRequest,
  extraRequestHeaders: Record<string, string> = {},
): NextResponse {
  const nonce = createNonce();
  const csp = buildCsp(nonce, process.env.NODE_ENV === 'development');
  const requestHeaders = new Headers(request.headers);
  for (const [name, value] of Object.entries(extraRequestHeaders)) requestHeaders.set(name, value);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}
