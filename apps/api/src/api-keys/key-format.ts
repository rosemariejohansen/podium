import { createHash, randomBytes } from 'node:crypto';
import { crc32 } from 'node:zlib';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const RANDOM_LENGTH = 43; // 62^43 > 2^256, so 32 random bytes always fit
const CHECKSUM_LENGTH = 6; // 62^6 > 2^32
const KEY_PATTERN = /^mos_([0-9A-Za-z]{43})_([0-9A-Za-z]{6})$/;

export const API_KEY_PREFIX_LENGTH = 12; // "mos_" + 8 characters, shown in the dashboard

function base62(value: bigint, length: number): string {
  let out = '';
  let n = value;
  while (n > 0n) {
    out = ALPHABET[Number(n % 62n)] + out;
    n /= 62n;
  }
  return out.padStart(length, '0');
}

const checksum = (random: string) => base62(BigInt(crc32(random)), CHECKSUM_LENGTH);

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const random = base62(BigInt(`0x${randomBytes(32).toString('hex')}`), RANDOM_LENGTH);
  const key = `mos_${random}_${checksum(random)}`;
  return { key, prefix: key.slice(0, API_KEY_PREFIX_LENGTH), hash: hashApiKey(key) };
}

/** Cheap structural check (format + CRC32) done before any Redis or database lookup (SEC-API-2). */
export function parseApiKey(raw: string): boolean {
  const match = KEY_PATTERN.exec(raw);
  return match !== null && checksum(match[1]!) === match[2];
}
