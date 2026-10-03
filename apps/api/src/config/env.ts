import { z } from 'zod';

export const ENV = Symbol('ENV');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Passed to Express "trust proxy": which hops may set X-Forwarded-For (SEC-API-12).
  TRUSTED_PROXY_CIDR: z.string().min(1).default('loopback'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SERVICE_TOKEN_PUBLIC_KEY: z.string().min(1),
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
