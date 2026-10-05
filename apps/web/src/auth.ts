import type { UserDto, UserSyncInput } from '@mos/contracts';
import NextAuth, { type NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import GitHub from 'next-auth/providers/github';
import { authConfig } from '@/auth.config';
import { apiFetch } from '@/lib/api/client';
import { toUserSyncInput } from '@/lib/auth/sync-input';
import { isTestModeEnabled } from '@/lib/auth/test-mode';

// Public profile only: the default scope also asks for user:email, which the app never uses.
const providers: NextAuthConfig['providers'] = [
  GitHub({ authorization: { params: { scope: 'read:user' } } }),
];
// Evaluated at module load: on a Vercel deployment with AUTH_TEST_MODE=1 the app fails to start.
if (isTestModeEnabled()) {
  providers.push(
    Credentials({
      id: 'test',
      name: 'Test login',
      credentials: { login: { label: 'Login', type: 'text' } },
      authorize(credentials) {
        const login = String(credentials?.login ?? '');
        return /^[a-z0-9-]{1,39}$/.test(login) ? { id: `test:${login}`, name: login } : null;
      },
    }),
  );
}

function syncUser(input: UserSyncInput): Promise<UserDto> {
  return apiFetch<UserDto>('/internal/users/sync', { method: 'POST', body: input, auth: 'system' });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers,
  callbacks: {
    ...authConfig.callbacks,
    // Runs with `account` set only at sign-in; later requests reuse the stored claims.
    async jwt({ token, account, profile, user }) {
      const input = toUserSyncInput({ account, profile, user });
      if (input) {
        const synced = await syncUser(input);
        token.userId = synced.id;
        token.login = synced.login;
        token.avatarUrl = synced.avatarUrl;
      }
      // Data minimisation: the session cookie never stores an e-mail address.
      delete token.email;
      return token;
    },
  },
});
