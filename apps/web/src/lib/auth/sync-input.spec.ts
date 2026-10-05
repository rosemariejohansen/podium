import { describe, expect, it } from 'vitest';
import { toUserSyncInput } from './sync-input';

const github = { provider: 'github' };
const avatar = 'https://avatars.githubusercontent.com/u/123?v=4';

describe('toUserSyncInput (FR-AUTH-2)', () => {
  it('maps a GitHub profile with a numeric id', () => {
    const profile = { id: 123, login: 'octocat', avatar_url: avatar, email: 'octo@example.com' };
    expect(toUserSyncInput({ account: github, profile })).toEqual({
      githubId: '123',
      login: 'octocat',
      avatarUrl: avatar,
    });
  });

  it.each([undefined, null])('maps a missing GitHub avatar (%s) to null', (avatar_url) => {
    const profile = { id: 7, login: 'no-avatar', avatar_url };
    expect(toUserSyncInput({ account: github, profile })).toEqual({
      githubId: '7',
      login: 'no-avatar',
      avatarUrl: null,
    });
  });

  it('maps the test provider to a test: githubId', () => {
    expect(
      toUserSyncInput({ account: { provider: 'test' }, user: { name: 'smoke-user' } }),
    ).toEqual({ githubId: 'test:smoke-user', login: 'smoke-user', avatarUrl: null });
  });

  it('returns null when there is nothing to sync', () => {
    // Later requests: Auth.js passes no account.
    expect(toUserSyncInput({ account: null, user: { name: 'x' } })).toBeNull();
    expect(toUserSyncInput({})).toBeNull();
    expect(toUserSyncInput({ account: { provider: 'google' }, profile: { id: 1 } })).toBeNull();
    expect(toUserSyncInput({ account: github })).toBeNull();
    expect(toUserSyncInput({ account: { provider: 'test' }, user: { name: null } })).toBeNull();
  });
});
