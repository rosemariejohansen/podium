import type { DefaultSession } from 'next-auth';
// next-auth/jwt re-exports @auth/core/jwt with `export *`; the JWT augmentation below only
// merges when this file imports the module.
import type {} from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: { id: string; login: string } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    login?: string;
    avatarUrl?: string | null;
  }
}
