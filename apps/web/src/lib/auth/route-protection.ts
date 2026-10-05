export interface RouteRequest {
  pathname: string;
  /** The query string including its leading '?', or ''. */
  search: string;
  origin: string;
  signedIn: boolean;
  /** The HTTP request method, e.g. 'GET'. */
  method: string;
}

/**
 * FR-AUTH-4: the /signin URL for an anonymous GET or HEAD request to /dashboard or /dashboard/…,
 * else null. Every other method passes through, including Server Actions (POSTs with or without
 * the `next-action` header): a 307 would replay the POST against /signin and fail, while
 * requireUser() answers with a proper redirect. The layout is not a guard (an RSC partial render
 * can skip it), so every page and Server Action under /dashboard must call requireUser() itself.
 */
export function signInRedirect(request: RouteRequest): URL | null {
  const { pathname, search, origin, signedIn, method } = request;
  const isDashboard = pathname === '/dashboard' || pathname.startsWith('/dashboard/');
  const isNavigation = method === 'GET' || method === 'HEAD';
  if (!isDashboard || signedIn || !isNavigation) return null;
  const url = new URL('/signin', origin);
  url.searchParams.set('callbackUrl', pathname + search);
  return url;
}
