import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/auth.config';
import { signInRedirect } from '@/lib/auth/route-protection';
import { REQUEST_PATH_HEADER } from '@/lib/auth/signin-url';
import { nextWithCsp } from '@/lib/csp';

// Edge-safe instance: reads and decrypts the session cookie only (no providers, no API calls).
const { auth } = NextAuth(authConfig);

export const proxy = auth((request) => {
  const { pathname, search, origin } = request.nextUrl;
  const redirectTo = signInRedirect({
    pathname,
    search,
    origin,
    signedIn: Boolean(request.auth?.user?.id),
    method: request.method,
  });
  if (redirectTo) return NextResponse.redirect(redirectTo);
  // requireUser() reads this to send the user back here after signing in. It is always set here,
  // so a header the client sent itself is overwritten.
  return nextWithCsp(request, { [REQUEST_PATH_HEADER]: pathname + search });
});

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
