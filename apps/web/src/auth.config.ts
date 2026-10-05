import type { NextAuthConfig } from 'next-auth';

export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // SEC-WEB-5

export const authConfig = {
  providers: [],
  session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE_SECONDS },
  // Errors land on the app's sign-in page (nonce CSP) instead of Auth.js's built-in error page.
  pages: { signIn: '/signin', error: '/signin' },
  callbacks: {
    session({ session, token }) {
      if (!token.userId) return session;
      // Data minimisation: only what the UI needs, never the e-mail address.
      return {
        ...session,
        user: {
          id: token.userId,
          login: token.login ?? '',
          name: session.user?.name,
          image: token.avatarUrl ?? null,
        },
      };
    },
  },
} satisfies NextAuthConfig;
