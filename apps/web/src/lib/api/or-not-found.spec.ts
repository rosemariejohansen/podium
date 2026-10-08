import { notFound } from 'next/navigation';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './client';
import { orNotFound } from './or-not-found';

const { NOT_FOUND } = vi.hoisted(() => ({ NOT_FOUND: new Error('NEXT_HTTP_ERROR_FALLBACK;404') }));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw NOT_FOUND;
  }),
}));

afterEach(() => {
  vi.mocked(notFound).mockClear();
});

describe('orNotFound', () => {
  it('passes a successful result through', async () => {
    const game = { id: 'game_1' };
    await expect(orNotFound(Promise.resolve(game))).resolves.toBe(game);
    expect(notFound).not.toHaveBeenCalled();
  });

  it('turns an API 404 into notFound()', async () => {
    const error = new ApiError(404, 'NOT_FOUND', 'Game not found');
    await expect(orNotFound(Promise.reject(error))).rejects.toBe(NOT_FOUND);
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it('rethrows other API errors unchanged', async () => {
    const error = new ApiError(403, 'INSUFFICIENT_SCOPE', 'Forbidden');
    await expect(orNotFound(Promise.reject(error))).rejects.toBe(error);
    expect(notFound).not.toHaveBeenCalled();
  });

  it('rethrows errors that are not API errors unchanged', async () => {
    const error = new TypeError('boom');
    await expect(orNotFound(Promise.reject(error))).rejects.toBe(error);
    expect(notFound).not.toHaveBeenCalled();
  });
});
