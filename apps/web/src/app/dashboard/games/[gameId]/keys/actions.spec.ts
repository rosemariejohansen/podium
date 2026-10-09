import type { ApiKeyCreatedDto } from '@mos/contracts';
import { revalidatePath } from 'next/cache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE } from '@/lib/action-state';
import { ApiError } from '@/lib/api/client';
import { createKey, revokeKey } from '@/lib/api/keys';
import { requireUser, type UserContext } from '@/lib/session';
import { createKeyAction, revokeKeyAction } from './actions';

const { REDIRECT } = vi.hoisted(() => ({ REDIRECT: new Error('NEXT_REDIRECT') }));

// session.ts imports next-auth, which Vitest cannot load.
vi.mock('@/lib/session', () => ({ requireUser: vi.fn() }));
vi.mock('@/lib/api/keys', () => ({ createKey: vi.fn(), revokeKey: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const ctx: UserContext = { userId: 'user_1', ip: '198.51.100.4', login: 'octo' };
const KEY = 'mos_SHOWN0NCESHOWN0NCESHOWN0NCESHOWN0NCESHOWN0NCE_a1b2c3';
const created: ApiKeyCreatedDto = {
  id: 'key_1',
  gameId: 'g1',
  name: 'prod',
  prefix: 'mos_SHOWN0NC',
  scopes: ['scores:read', 'scores:write'],
  status: 'active',
  createdAt: '2026-10-09T00:00:00.000Z',
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  key: KEY,
};

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const;
const consoleSpies = CONSOLE_METHODS.map((method) =>
  vi.spyOn(console, method).mockImplementation(() => undefined),
);

beforeEach(() => {
  vi.mocked(requireUser).mockReset().mockResolvedValue(ctx);
  vi.mocked(createKey).mockReset().mockResolvedValue(created);
  vi.mocked(revokeKey).mockReset();
  vi.mocked(revalidatePath).mockReset();
  for (const spy of consoleSpies) spy.mockClear();
});
afterEach(() => {
  for (const spy of consoleSpies) spy.mockClear();
});

const form = (
  scopes: string[] = ['scores:read', 'scores:write'],
  expiry: string | null = 'never',
  name = 'prod',
) => {
  const fd = new FormData();
  fd.set('name', name);
  for (const scope of scopes) fd.append('scopes', scope);
  if (expiry !== null) fd.set('expiresInDays', expiry);
  return fd;
};

describe('createKeyAction', () => {
  // The dashboard layout is not a guard (it can be skipped on a partial render), so the action
  // has to check the session itself, before it looks at the form.
  it('checks the session first: no session means a redirect, not a validation error', async () => {
    vi.mocked(requireUser).mockRejectedValue(REDIRECT);
    await expect(createKeyAction('g1', IDLE, new FormData())).rejects.toBe(REDIRECT);
    await expect(createKeyAction('g1', IDLE, form())).rejects.toBe(REDIRECT);
    expect(createKey).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('creates the key from the form and returns it in createdKey', async () => {
    const state = await createKeyAction(
      'g1',
      IDLE,
      form(['scores:read', 'scores:write'], '90', ' prod '),
    );
    expect(createKey).toHaveBeenCalledTimes(1);
    expect(createKey).toHaveBeenCalledWith(ctx, 'g1', {
      name: 'prod',
      scopes: ['scores:read', 'scores:write'],
      expiresInDays: 90,
    });
    expect(state.status).toBe('success');
    expect(state.message).toContain('prod');
    // Exactly what the dialog needs, and nothing else from the DTO.
    expect(state.createdKey).toEqual({ id: 'key_1', name: 'prod', key: KEY });
  });

  it('sends "never" as a null expiry', async () => {
    await createKeyAction('g1', IDLE, form(['scores:write'], 'never'));
    expect(createKey).toHaveBeenCalledWith(ctx, 'g1', {
      name: 'prod',
      scopes: ['scores:write'],
      expiresInDays: null,
    });
  });

  // SEC-WEB-10: the plaintext key lives in the returned state and in the reveal dialog, and
  // nowhere else: not in the message, the echoed values, the revalidation, a log or a redirect.
  it('puts the plaintext key nowhere but createdKey', async () => {
    const state = await createKeyAction('g1', IDLE, form());
    const { createdKey, ...rest } = state;
    expect(createdKey?.key).toBe(KEY);
    expect(JSON.stringify(rest)).not.toContain(KEY);
    expect(rest.values).toBeUndefined();

    expect(revalidatePath).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/games/g1', 'layout');
    expect(JSON.stringify(vi.mocked(revalidatePath).mock.calls)).not.toContain(KEY);

    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });

  it.each([
    ['no scope is checked', form([], 'never'), 'scopes', 'Choose at least one scope'],
    [
      'the expiry is not one of the options',
      form(['scores:read'], '7'),
      'expiresInDays',
      undefined,
    ],
    ['the name is blank', form(['scores:read'], 'never', '   '), 'name', 'Required'],
  ])('returns a field error and calls nothing when %s', async (_why, fd, field, message) => {
    const state = await createKeyAction('g1', IDLE, fd);
    expect(state.status).toBe('error');
    expect(state.fieldErrors).toHaveProperty(field);
    if (message) expect(state.fieldErrors?.[field]).toBe(message);
    expect(state.createdKey).toBeUndefined();
    expect(state.values).toMatchObject({ name: fd.get('name') });
    expect(createKey).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('turns an API error into form state and keeps what the user typed', async () => {
    vi.mocked(createKey).mockRejectedValue(
      new ApiError(403, 'QUOTA_EXCEEDED', 'This game has reached its key limit'),
    );
    const state = await createKeyAction('g1', IDLE, form(['scores:read'], '30', 'staging'));
    expect(state).toMatchObject({
      status: 'error',
      message: 'This game has reached its key limit',
      values: { name: 'staging', expiresInDays: '30' },
    });
    expect(state.createdKey).toBeUndefined();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rethrows an error that is not an API error', async () => {
    const boom = new TypeError('boom');
    vi.mocked(createKey).mockRejectedValue(boom);
    await expect(createKeyAction('g1', IDLE, form())).rejects.toBe(boom);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('revokeKeyAction', () => {
  it('checks the session first', async () => {
    vi.mocked(requireUser).mockRejectedValue(REDIRECT);
    await expect(revokeKeyAction('g1', 'key_1')).rejects.toBe(REDIRECT);
    expect(revokeKey).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('revokes the key as the signed-in user and revalidates the game', async () => {
    const state = await revokeKeyAction('g1', 'key_1');
    expect(state.status).toBe('success');
    expect(revokeKey).toHaveBeenCalledWith(ctx, 'key_1');
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/games/g1', 'layout');
  });

  // F6: the page's error boundary is for crashes. An API refusal is a message beside the key.
  it.each([
    [429, 'RATE_LIMITED', 'Too many requests'],
    [503, 'SERVICE_UNAVAILABLE', 'The API is unreachable'],
    [500, 'INTERNAL_ERROR', 'Something went wrong'],
  ] as const)(
    'returns the error as state, not a throw, for an API %s',
    async (status, code, message) => {
      vi.mocked(revokeKey).mockRejectedValue(new ApiError(status, code, message));
      const state = await revokeKeyAction('g1', 'key_1');
      expect(state).toMatchObject({ status: 'error', message });
      // The key may still be live, and nothing on the page changed.
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  // The key is gone (deleted elsewhere), so the list on screen is stale.
  it('refreshes the list when the key is not found, and says so', async () => {
    vi.mocked(revokeKey).mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Key not found'));
    const state = await revokeKeyAction('g1', 'key_1');
    expect(state).toMatchObject({ status: 'error', message: 'Key not found' });
    expect(revalidatePath).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/games/g1', 'layout');
  });

  it('rethrows an error that is not an API error', async () => {
    const boom = new TypeError('boom');
    vi.mocked(revokeKey).mockRejectedValue(boom);
    await expect(revokeKeyAction('g1', 'key_1')).rejects.toBe(boom);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
