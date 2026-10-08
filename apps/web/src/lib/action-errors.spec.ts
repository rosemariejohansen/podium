import { describe, expect, it } from 'vitest';
import { ApiError } from './api/client';
import { fromApiError } from './action-errors';

const data = new FormData();
data.set('slug', 'taken');

describe('fromApiError', () => {
  it('maps VALIDATION_FAILED issues to field errors', () => {
    const error = new ApiError(400, 'VALIDATION_FAILED', 'Validation failed', {
      issues: [{ path: 'maxScore', message: 'Too small' }],
    });
    expect(fromApiError(error, data)).toMatchObject({
      status: 'error',
      fieldErrors: { maxScore: 'Too small' },
      values: { slug: 'taken' },
    });
  });
  it.each([
    ['SLUG_TAKEN', 'slug'],
    ['CONFIRMATION_MISMATCH', 'confirm'],
  ] as const)('attaches %s to the %s field', (code, field) => {
    expect(fromApiError(new ApiError(409, code, 'msg'), data).fieldErrors).toEqual({
      [field]: 'msg',
    });
  });
  it('keeps other API errors as a form-level message', () => {
    expect(
      fromApiError(new ApiError(403, 'QUOTA_EXCEEDED', 'At most 10 games'), data),
    ).toMatchObject({
      status: 'error',
      message: 'At most 10 games',
      fieldErrors: undefined,
    });
  });
  it('rethrows non-API errors (e.g. Next.js redirects)', () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;replace;/x;307;',
    });
    expect(() => fromApiError(redirect, data)).toThrow('NEXT_REDIRECT');
  });
});
