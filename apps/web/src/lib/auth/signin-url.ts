import { safeRedirect } from './safe-redirect';

/**
 * Request header the proxy sets to the request's pathname + search, so requireUser() can send the
 * user back to the page after signing in. The proxy always overwrites it (a client-sent value
 * never reaches the app on a proxied request), and signInPath() runs it through safeRedirect()
 * anyway for the requests the proxy skips (prefetches and the excluded paths).
 */
export const REQUEST_PATH_HEADER = 'x-mos-path';

const SIGNIN = '/signin';
/** safeRedirect()'s answer for everything it rejects. */
const REJECTED = '/dashboard';

/**
 * The /signin path (relative, for redirect()) for an unauthenticated request to `requestPath`:
 * `/signin?callbackUrl=<path>` when the value is a safe same-origin path, else plain `/signin`
 * (which lands on /dashboard after signing in).
 */
export function signInPath(requestPath: string | null | undefined): string {
  if (!requestPath) return SIGNIN;
  const target = safeRedirect(requestPath);
  // safeRedirect() answers its fallback for anything unsafe, so only the exact input '/dashboard'
  // is a genuine /dashboard.
  if (target === REJECTED && requestPath !== REJECTED) return SIGNIN;
  return `${SIGNIN}?${new URLSearchParams({ callbackUrl: target })}`;
}
