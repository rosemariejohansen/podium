import { isIP } from 'node:net';

/** The longest textual IP address: IPv4-mapped IPv6 written in full (45 characters). */
const MAX_IP_LENGTH = 45;

/**
 * The end user's IP for the service token (SEC-WEB-2): the first X-Forwarded-For hop, else (only
 * when that first hop is missing or blank) X-Real-IP. An invalid first hop gives null; it does not
 * fall back to X-Real-IP. Vercel sets these headers; elsewhere the client controls them,
 * so anything that is not a plain IP address becomes null. That includes IPv6 zone IDs ('%…'),
 * which net.isIP accepts at any length.
 */
export function clientIp(headers: Pick<Headers, 'get'>): string | null {
  const candidate =
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip')?.trim();
  if (!candidate || candidate.length > MAX_IP_LENGTH || candidate.includes('%')) return null;
  return isIP(candidate) ? candidate : null;
}
