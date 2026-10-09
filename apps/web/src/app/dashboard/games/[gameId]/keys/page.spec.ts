import type { ApiKeyDto } from '@mos/contracts';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyCreateForm } from '@/components/keys/key-create-form';
import { RevokeKeyButton } from '@/components/keys/revoke-key-button';
import { IDLE } from '@/lib/action-state';
import { ApiError } from '@/lib/api/client';
import { listKeys } from '@/lib/api/keys';
import { requireUser, type UserContext } from '@/lib/session';
import { createKeyAction, revokeKeyAction } from './actions';
import KeysPage from './page';

const { REDIRECT, NOT_FOUND } = vi.hoisted(() => ({
  REDIRECT: new Error('NEXT_REDIRECT'),
  NOT_FOUND: new Error('NEXT_HTTP_ERROR_FALLBACK;404'),
}));

// session.ts imports next-auth, which Vitest cannot load.
vi.mock('@/lib/session', () => ({ requireUser: vi.fn() }));
vi.mock('@/lib/api/keys', () => ({ listKeys: vi.fn() }));
vi.mock('./actions', () => ({ createKeyAction: vi.fn(), revokeKeyAction: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw NOT_FOUND;
  }),
}));

type Props = Record<string, unknown> & { children?: ReactNode };
type El = ReactElement<Props>;

function findAll(node: ReactNode, match: (el: El) => boolean, found: El[] = []): El[] {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child as ReactNode, match, found);
    return found;
  }
  if (!isValidElement<Props>(node)) return found;
  if (match(node)) found.push(node);
  return findAll(node.props.children, match, found);
}

function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map((child) => text(child as ReactNode)).join('');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return isValidElement<Props>(node) ? `${text(node.props.children)}\n` : '';
}

const ctx: UserContext = { userId: 'user_1', ip: '198.51.100.4', login: 'octo' };
const params = Promise.resolve({ gameId: 'g1' });

const key = (overrides: Partial<ApiKeyDto>): ApiKeyDto => ({
  id: 'k1',
  gameId: 'g1',
  name: 'prod',
  prefix: 'mos_abcd1234',
  scopes: ['scores:read', 'scores:write'],
  status: 'active',
  createdAt: '2026-10-03T12:00:00.000Z',
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  ...overrides,
});

beforeEach(() => {
  vi.mocked(requireUser).mockReset().mockResolvedValue(ctx);
  vi.mocked(listKeys).mockReset().mockResolvedValue([]);
  vi.mocked(createKeyAction).mockReset();
  vi.mocked(revokeKeyAction).mockReset();
});

describe('KeysPage', () => {
  // The dashboard layout is not a guard (it can be skipped on a partial render), so the page
  // has to check the session itself.
  it('checks the session itself and calls the API only for a signed-in user', async () => {
    vi.mocked(requireUser).mockRejectedValue(REDIRECT);
    await expect(KeysPage({ params })).rejects.toBe(REDIRECT);
    expect(listKeys).not.toHaveBeenCalled();
  });

  it("lists the game's keys as the signed-in user", async () => {
    await KeysPage({ params });
    expect(listKeys).toHaveBeenCalledWith(ctx, 'g1');
  });

  it('turns an API 404 into the not-found page, and rethrows other API errors', async () => {
    vi.mocked(listKeys).mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', 'Game not found'));
    await expect(KeysPage({ params })).rejects.toBe(NOT_FOUND);

    const unavailable = new ApiError(503, 'SERVICE_UNAVAILABLE', 'The API is unreachable');
    vi.mocked(listKeys).mockRejectedValueOnce(unavailable);
    await expect(KeysPage({ params })).rejects.toBe(unavailable);
  });

  it('says so when there are no keys yet, and still offers the create form', async () => {
    const tree = await KeysPage({ params });
    expect(text(tree)).toContain('No API keys yet');
    expect(findAll(tree, (el) => el.type === RevokeKeyButton)).toHaveLength(0);
    expect(findAll(tree, (el) => el.type === KeyCreateForm)).toHaveLength(1);
  });

  // FR-KEY-3: name, prefix, scopes, created, last used, expires and status. The table never has
  // the plaintext key to show: the API returns only the prefix.
  it('lists each key with its prefix, scopes, dates and status', async () => {
    vi.mocked(listKeys).mockResolvedValue([
      key({
        id: 'k1',
        name: 'prod',
        lastUsedAt: '2026-10-08T09:30:00.000Z',
        expiresAt: '2027-01-05T00:00:00.000Z',
      }),
    ]);
    const shown = text(await KeysPage({ params }));
    for (const expected of [
      'prod',
      'mos_abcd1234…',
      'scores:read, scores:write',
      'Oct 3, 2026',
      'Oct 8, 2026',
      'Jan 5, 2027',
      'active',
    ]) {
      expect(shown).toContain(expected);
    }
    expect(shown).not.toContain('No API keys yet');
  });

  it('shows "never" for a key that was never used and does not expire', async () => {
    vi.mocked(listKeys).mockResolvedValue([key({ lastUsedAt: null, expiresAt: null })]);
    expect(text(await KeysPage({ params })).match(/never/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('offers Revoke for a live key but not for a revoked one', async () => {
    vi.mocked(listKeys).mockResolvedValue([
      key({ id: 'k1', name: 'prod' }),
      key({ id: 'k2', name: 'old', status: 'revoked', revokedAt: '2026-10-05T00:00:00.000Z' }),
    ]);
    const buttons = findAll(await KeysPage({ params }), (el) => el.type === RevokeKeyButton);
    expect(buttons.map((el) => el.props.name)).toEqual(['prod']);

    // The button runs the action bound to this game and this key.
    await (buttons[0]!.props.action as () => Promise<void>)();
    expect(revokeKeyAction).toHaveBeenCalledWith('g1', 'k1');
  });

  it('binds the create form to this game', async () => {
    const [form] = findAll(await KeysPage({ params }), (el) => el.type === KeyCreateForm);
    const fd = new FormData();
    await (form!.props.action as (prev: unknown, fd: FormData) => Promise<unknown>)(IDLE, fd);
    expect(createKeyAction).toHaveBeenCalledWith('g1', IDLE, fd);
  });
});
