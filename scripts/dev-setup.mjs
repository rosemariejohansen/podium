#!/usr/bin/env node
// Creates local env files from their *.example templates and fills generated secrets.
// Never overwrites an existing env file. Secrets are generated once into .dev-keys/
// so files created on later runs share the same key pair.
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const keyDir = join(root, '.dev-keys');

const ENV_FILES = [
  ['apps/api/.env.example', 'apps/api/.env'],
  ['apps/api/.env.test.example', 'apps/api/.env.test'],
  ['apps/web/.env.example', 'apps/web/.env.local'],
];

function loadOrCreateSecrets() {
  const privPath = join(keyDir, 'service-token-private.b64');
  const pubPath = join(keyDir, 'service-token-public.b64');
  const authPath = join(keyDir, 'auth-secret');
  if (!existsSync(privPath)) {
    mkdirSync(keyDir, { recursive: true });
    const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    writeFileSync(privPath, Buffer.from(privateKey).toString('base64'), { mode: 0o600 });
    writeFileSync(pubPath, Buffer.from(publicKey).toString('base64'));
    writeFileSync(authPath, randomBytes(32).toString('base64'), { mode: 0o600 });
  }
  return {
    __SERVICE_TOKEN_PRIVATE_KEY__: readFileSync(privPath, 'utf8'),
    __SERVICE_TOKEN_PUBLIC_KEY__: readFileSync(pubPath, 'utf8'),
    __AUTH_SECRET__: readFileSync(authPath, 'utf8'),
  };
}

const secrets = loadOrCreateSecrets();
for (const [example, target] of ENV_FILES) {
  const examplePath = join(root, example);
  const targetPath = join(root, target);
  if (!existsSync(examplePath)) {
    console.log(`skip    ${target} (no ${example} yet)`);
    continue;
  }
  if (existsSync(targetPath)) {
    console.log(`keep    ${target} (already exists)`);
    continue;
  }
  let content = readFileSync(examplePath, 'utf8');
  for (const [placeholder, value] of Object.entries(secrets)) {
    content = content.replaceAll(placeholder, value);
  }
  writeFileSync(targetPath, content, { mode: 0o600 });
  console.log(`created ${target}`);
}
