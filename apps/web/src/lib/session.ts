import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import type { ApiAuth } from '@/lib/api/client';
import { clientIp } from '@/lib/client-ip';

export interface UserContext {
  userId: string;
  ip: string | null;
  login: string;
}

/** For dashboard pages and server actions. Redirects to /signin when there is no session. */
export async function requireUser(): Promise<UserContext> {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');
  // On Vercel, x-forwarded-for is set by the platform to the real client IP.
  const ip = clientIp(await headers());
  return { userId: session.user.id, ip, login: session.user.login };
}

export function apiAuth(ctx: UserContext): ApiAuth {
  return { userId: ctx.userId, ip: ctx.ip };
}
