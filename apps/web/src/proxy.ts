import type { NextRequest } from 'next/server';
import { nextWithCsp } from '@/lib/csp';

export function proxy(request: NextRequest) {
  return nextWithCsp(request);
}

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
