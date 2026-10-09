import { generateKeyPairSync } from 'node:crypto';
import { config } from 'dotenv';
import { isEd25519PublicKey } from '../src/config/env.js';

// Local runs read apps/api/.env.test; CI sets the variables directly and has no file.
config({ path: '.env.test', override: true, quiet: true });

// loadEnv rejects an invalid SERVICE_TOKEN_PUBLIC_KEY at boot, and CI only sets the placeholder
// "set-by-tests". Suites that do not import test/helpers/tokens.ts (which overrides this per file
// with the key it signs with) still need an app that boots, so fall back to a throwaway key.
const currentKey = process.env.SERVICE_TOKEN_PUBLIC_KEY;
if (!currentKey || !isEd25519PublicKey(currentKey)) {
  const { publicKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  process.env.SERVICE_TOKEN_PUBLIC_KEY = Buffer.from(publicKey).toString('base64');
}
