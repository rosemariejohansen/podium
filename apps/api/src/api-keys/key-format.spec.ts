import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { API_KEY_PREFIX_LENGTH, generateApiKey, hashApiKey, parseApiKey } from './key-format.js';

describe('API key format (FR-KEY-5)', () => {
  it('generates mos_<43 base62>_<6 base62> with a matching prefix and hash', () => {
    const { key, prefix, hash } = generateApiKey();
    expect(key).toMatch(/^mos_[0-9A-Za-z]{43}_[0-9A-Za-z]{6}$/);
    expect(prefix).toBe(key.slice(0, API_KEY_PREFIX_LENGTH));
    expect(prefix).toHaveLength(12);
    expect(hash).toBe(createHash('sha256').update(key).digest('hex'));
    expect(hashApiKey(key)).toBe(hash);
  });

  it('never repeats', () => {
    const keys = new Set(Array.from({ length: 200 }, () => generateApiKey().key));
    expect(keys.size).toBe(200);
  });

  it('accepts its own keys', () => {
    for (let i = 0; i < 50; i++) expect(parseApiKey(generateApiKey().key)).toBe(true);
  });

  it('rejects a single changed character (checksum)', () => {
    const { key } = generateApiKey();
    const i = 10;
    const swapped = key.slice(0, i) + (key[i] === 'a' ? 'b' : 'a') + key.slice(i + 1);
    expect(parseApiKey(swapped)).toBe(false);
  });

  it.each([
    '',
    'mos_',
    'sk_live_abc',
    `mos_${'a'.repeat(43)}`,
    `mos_${'a'.repeat(42)}_000000`,
    `MOS_${'a'.repeat(43)}_000000`,
    ' mos_x',
  ])('rejects malformed input %j', (raw) => {
    expect(parseApiKey(raw)).toBe(false);
  });
});
