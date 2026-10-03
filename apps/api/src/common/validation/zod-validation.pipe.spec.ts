import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppException } from '../errors/app-exception.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const pipe = new ZodValidationPipe(z.strictObject({ name: z.string().trim().min(1) }));

describe('ZodValidationPipe', () => {
  it('returns parsed data', () => {
    expect(pipe.transform({ name: '  Neo ' })).toEqual({ name: 'Neo' });
  });
  it('throws VALIDATION_FAILED with issue paths', () => {
    try {
      pipe.transform({ name: '' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppException);
      const err = e as AppException;
      expect(err.code).toBe('VALIDATION_FAILED');
      expect(err.getStatus()).toBe(400);
      expect(err.details).toEqual({ issues: [{ path: 'name', message: expect.any(String) }] });
    }
  });
  it('rejects a missing body', () => {
    expect(() => pipe.transform(undefined)).toThrow(AppException);
  });
});
