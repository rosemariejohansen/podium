import { createPublicKey } from 'node:crypto';
import { decodePem } from '@mos/service-token';
import { z } from 'zod';

export const ENV = Symbol('ENV');

// verifyServiceToken imports the key with jose's importSPKI, which only takes a "PUBLIC KEY" PEM,
// so a private key (which createPublicKey would also accept) must not pass either.
const SPKI_PEM_HEADER = '-----BEGIN PUBLIC KEY-----';

/** True when the value (PEM or base64 PEM) is an Ed25519 SPKI public key. Never throws. */
export function isEd25519PublicKey(value: string): boolean {
  try {
    const pem = decodePem(value);
    return pem.startsWith(SPKI_PEM_HEADER) && createPublicKey(pem).asymmetricKeyType === 'ed25519';
  } catch {
    return false;
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Passed to Express "trust proxy": which hops may set X-Forwarded-For (SEC-API-12).
  TRUSTED_PROXY_CIDR: z.string().min(1).default('loopback'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  // Checked at boot so a bad key fails here, not as a 401 on every request. The message must
  // not echo the value.
  SERVICE_TOKEN_PUBLIC_KEY: z.string().refine(isEd25519PublicKey, {
    error: 'must be an Ed25519 public key (SPKI PEM, or base64 of one)',
  }),
});

export type Env = z.output<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  return result.data;
}
