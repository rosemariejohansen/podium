import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // "server-only" throws outside a React Server Components bundle; tests run in plain Node.
    alias: { 'server-only': fileURLToPath(new URL('./test/empty.ts', import.meta.url)) },
  },
  test: { include: ['src/**/*.spec.ts', '*.spec.ts'], environment: 'node' },
});
