import { describe, expect, it } from 'vitest';
import { pathSegment } from './path-segment';

describe('pathSegment', () => {
  it('returns an ordinary id unchanged', () => {
    expect(pathSegment('cmg1a2b3c0000abcd1234efgh')).toBe('cmg1a2b3c0000abcd1234efgh');
  });

  it('encodes characters that would change the path or query', () => {
    expect(pathSegment('a/b')).toBe('a%2Fb');
    expect(pathSegment('a?b#c')).toBe('a%3Fb%23c');
    expect(pathSegment('a b%')).toBe('a%20b%25');
    expect(pathSegment('../x')).toBe('..%2Fx');
    expect(pathSegment('%2e%2e')).toBe('%252e%252e');
  });

  it.each(['', '.', '..'])('throws a TypeError for %j', (value) => {
    expect(() => pathSegment(value)).toThrow(TypeError);
  });

  // Bound Server Action arguments are client-controlled, so the declared `string` type is not
  // enforced at runtime. encodeURIComponent stringifies its input: ['..'] would become '..'.
  it.each([[['..']], [['a']], [123], [null], [undefined], [{}]])(
    'throws a TypeError for the non-string %j',
    (value) => {
      expect(() => pathSegment(value as unknown as string)).toThrow(TypeError);
    },
  );
});
