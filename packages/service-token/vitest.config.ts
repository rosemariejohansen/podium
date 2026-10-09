import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Ed25519 key generation is slow on a loaded 2-core machine.
  test: { include: ['src/**/*.spec.ts'], testTimeout: 15_000 },
});
