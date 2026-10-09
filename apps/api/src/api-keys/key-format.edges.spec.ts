import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateApiKey, hashApiKey, parseApiKey } from './key-format.js';

// Pass-through by default; a test queues fixed bytes with mockReturnValueOnce.
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, randomBytes: vi.fn(actual.randomBytes) };
});

// Known answers, computed outside the implementation (Python zlib.crc32 and its own base62):
// random part = the 32 bytes as one big-endian integer in base62, left-padded with '0' to 43;
// checksum = CRC32 of the random part's text in base62, left-padded with '0' to 6.
const ZERO_KEY = `mos_${'0'.repeat(43)}_2CZclj`;
const MAX_KEY = 'mos_yhjskwdA6OZ1AL1YmHWZWm8LLG7HjnuCA2j5rOw8Xp1_3sRzl1';
const ONE_KEY = `mos_${'0'.repeat(42)}1_0HNUPx`;

const bytes = (fill: number, last = fill) => {
  const buffer = Buffer.alloc(32, fill);
  buffer[31] = last;
  return buffer;
};

describe('API key format edges (FR-KEY-5)', () => {
  beforeEach(() => {
    vi.mocked(randomBytes).mockClear();
  });

  it('draws 32 bytes from the crypto random source', () => {
    generateApiKey();
    expect(randomBytes).toHaveBeenCalledOnce();
    expect(randomBytes).toHaveBeenCalledWith(32);
  });

  it('zero-pads the random part to 43 characters', () => {
    vi.mocked(randomBytes).mockReturnValueOnce(bytes(0) as never);
    const { key, prefix, hash } = generateApiKey();
    expect(key).toBe(ZERO_KEY);
    expect(prefix).toBe('mos_00000000');
    expect(hash).toBe(hashApiKey(ZERO_KEY));
    expect(parseApiKey(key)).toBe(true);
  });

  it('fits the largest possible value in exactly 43 characters', () => {
    vi.mocked(randomBytes).mockReturnValueOnce(bytes(0xff) as never);
    const { key } = generateApiKey();
    expect(key).toBe(MAX_KEY);
    expect(parseApiKey(key)).toBe(true);
  });

  it('zero-pads a checksum that needs fewer than 6 characters', () => {
    vi.mocked(randomBytes).mockReturnValueOnce(bytes(0, 1) as never);
    const { key } = generateApiKey();
    expect(key).toBe(ONE_KEY);
    expect(key).toHaveLength(54);
    expect(parseApiKey(key)).toBe(true);
  });

  it('hashes to 64 lowercase hex characters', () => {
    expect(hashApiKey(ZERO_KEY)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey(ZERO_KEY)).not.toBe(hashApiKey(MAX_KEY));
  });

  it('accepts the known-answer keys and rejects each with a wrong checksum', () => {
    for (const key of [ZERO_KEY, MAX_KEY, ONE_KEY]) {
      expect(parseApiKey(key)).toBe(true);
      expect(parseApiKey(`${key.slice(0, -1)}${key.endsWith('a') ? 'b' : 'a'}`)).toBe(false);
      expect(parseApiKey(`${key.slice(0, -6)}000000`)).toBe(false);
    }
  });

  it.each([
    `${MAX_KEY}\n`,
    `${MAX_KEY} `,
    ` ${MAX_KEY}`,
    `${MAX_KEY}${MAX_KEY}`,
    MAX_KEY.toUpperCase(),
  ])('rejects a valid key with surrounding or repeated text %j', (raw) => {
    expect(parseApiKey(raw)).toBe(false);
  });
});
