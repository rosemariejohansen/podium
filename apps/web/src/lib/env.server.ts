import 'server-only';
import { z } from 'zod';

const schema = z.object({
  API_URL: z.url(),
  SERVICE_TOKEN_PRIVATE_KEY: z.string().min(1),
});

let cached: z.output<typeof schema> | undefined;

/** Parsed lazily so `next build` works without runtime secrets (every page renders dynamically). */
export function serverEnv(): z.output<typeof schema> {
  cached ??= schema.parse(process.env);
  return cached;
}
