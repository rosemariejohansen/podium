import { describe, expect, it } from 'vitest';
import { clientIp } from './client-ip';

const ip = (headers: Record<string, string>) => clientIp(new Headers(headers));

describe('clientIp', () => {
  it('takes the first X-Forwarded-For hop', () => {
    expect(ip({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' })).toBe('203.0.113.9');
    expect(ip({ 'x-forwarded-for': ' 2001:db8::1 ' })).toBe('2001:db8::1');
  });

  it('prefers X-Forwarded-For over X-Real-IP', () => {
    expect(ip({ 'x-forwarded-for': '203.0.113.9', 'x-real-ip': '198.51.100.7' })).toBe(
      '203.0.113.9',
    );
  });

  it('falls back to X-Real-IP when X-Forwarded-For is absent or empty', () => {
    expect(ip({ 'x-real-ip': '198.51.100.7' })).toBe('198.51.100.7');
    expect(ip({ 'x-forwarded-for': '', 'x-real-ip': '198.51.100.7' })).toBe('198.51.100.7');
  });

  it('does not fall back to X-Real-IP when the X-Forwarded-For hop is invalid', () => {
    expect(ip({ 'x-forwarded-for': 'not-an-ip', 'x-real-ip': '198.51.100.7' })).toBeNull();
  });

  it('drops values that are not an IP address', () => {
    expect(ip({ 'x-forwarded-for': 'not-an-ip, 10.0.0.1' })).toBeNull();
    expect(ip({ 'x-forwarded-for': '1'.repeat(5000) })).toBeNull();
    expect(ip({ 'x-real-ip': '<script>' })).toBeNull();
  });

  it('drops IPv6 zone IDs and over-long values', () => {
    expect(ip({ 'x-forwarded-for': 'fe80::1%eth0' })).toBeNull();
    expect(ip({ 'x-real-ip': 'fe80::1%a.b-c:d' })).toBeNull();
    expect(ip({ 'x-forwarded-for': `fe80::1%${'a'.repeat(8000)}, 10.0.0.1` })).toBeNull();
  });

  it('is null without forwarding headers', () => {
    expect(ip({})).toBeNull();
  });
});
