import type { UserSyncInput } from '@mos/contracts';

/** The parts of the Auth.js `jwt` callback arguments that the user sync needs. */
export interface SignInData {
  account?: { provider: string } | null;
  profile?: object;
  user?: { name?: string | null } | null;
}

interface GitHubProfile {
  id: number | string;
  login: string;
  avatar_url?: string | null;
}

/**
 * FR-AUTH-2: the POST /internal/users/sync body for a fresh sign-in, or null when there is nothing
 * to sync (Auth.js passes `account` only on the sign-in request itself).
 */
export function toUserSyncInput({ account, profile, user }: SignInData): UserSyncInput | null {
  if (account?.provider === 'github' && profile) {
    const gh = profile as GitHubProfile;
    return { githubId: String(gh.id), login: gh.login, avatarUrl: gh.avatar_url ?? null };
  }
  if (account?.provider === 'test' && user?.name) {
    return { githubId: `test:${user.name}`, login: user.name, avatarUrl: null };
  }
  return null;
}
