const FALLBACK = '/dashboard';
/** Fixed dummy origin; only used to resolve and normalise the path. */
const BASE = 'http://safe-redirect.invalid';

/**
 * Open-redirect guard for the sign-in callbackUrl. Only same-origin relative paths pass: '/' not
 * followed by '/' or '\', with no backslash, whitespace or control character anywhere (browsers
 * and URL parsers treat '\' like '/' and strip tabs and newlines). The value is then resolved with
 * the WHATWG URL parser, so dot segments ('/..//x', '/%2e//x') cannot normalise into a
 * protocol-relative '//host' path. Returns the normalised path, query and fragment; anything else
 * goes to /dashboard.
 */
export function safeRedirect(callbackUrl: unknown): string {
  if (typeof callbackUrl !== 'string') return FALLBACK;
  if (!/^\/(?![/\\])/.test(callbackUrl) || /[\\\s\p{Cc}]/u.test(callbackUrl)) return FALLBACK;
  const url = new URL(callbackUrl, BASE);
  if (url.origin !== BASE || url.pathname.startsWith('//')) return FALLBACK;
  return url.pathname + url.search + url.hash;
}
