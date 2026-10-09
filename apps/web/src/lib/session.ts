import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import type { ApiAuth } from '@/lib/api/client';
import { REQUEST_PATH_HEADER, signInPath } from '@/lib/auth/signin-url';
import { clientIp } from '@/lib/client-ip';

export interface UserContext {
  userId: string;
  ip: string | null;
  login: string;
}

/**
 * For dashboard pages and server actions. Redirects to /signin when there is no session, with
 * the page the request was for (set by the proxy) as the callbackUrl.
 */
export async function requireUser(): Promise<UserContext> {
  const session = await auth();
  const requestHeaders = await headers();
  if (!session?.user?.id) redirect(signInPath(requestHeaders.get(REQUEST_PATH_HEADER)));
  // On Vercel, x-forwarded-for is set by the platform to the real client IP.
  const ip = clientIp(requestHeaders);
  return { userId: session.user.id, ip, login: session.user.login };
}

export function apiAuth(ctx: UserContext): ApiAuth {
  return { userId: ctx.userId, ip: ctx.ip };
}
