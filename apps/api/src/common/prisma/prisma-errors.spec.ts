import { describe, expect, it } from 'vitest';
import { isUniqueViolation } from './prisma-errors.js';

describe('isUniqueViolation', () => {
  it('recognises Prisma P2002', () => {
    expect(
      isUniqueViolation(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })),
    ).toBe(true);
  });
  it.each([new Error('x'), { code: 'P2025' }, null, 'P2002'])('ignores %o', (value) => {
    expect(isUniqueViolation(value)).toBe(false);
  });
});
