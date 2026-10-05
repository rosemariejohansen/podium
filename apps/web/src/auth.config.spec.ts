import { describe, expect, it } from 'vitest';
import { authConfig } from './auth.config';

type SessionArgs = Parameters<typeof authConfig.callbacks.session>[0];

describe('authConfig', () => {
  it('sends Auth.js errors to the CSP-covered sign-in page', () => {
    expect(authConfig.pages).toEqual({ signIn: '/signin', error: '/signin' });
  });

  it('exposes id, login, name and image in the session, never the e-mail address', async () => {
    const avatar = 'https://avatars.githubusercontent.com/u/123?v=4';
    const session = await authConfig.callbacks.session({
      session: {
        user: { name: 'The Octocat', email: 'octo@example.com', image: avatar },
        expires: '2026-10-11T00:00:00.000Z',
      },
      token: {
        userId: 'cuser1',
        login: 'octocat',
        avatarUrl: avatar,
        name: 'The Octocat',
        email: 'octo@example.com',
      },
    } as unknown as SessionArgs);
    expect(session).toEqual({
      expires: '2026-10-11T00:00:00.000Z',
      user: { id: 'cuser1', login: 'octocat', name: 'The Octocat', image: avatar },
    });
  });
});
