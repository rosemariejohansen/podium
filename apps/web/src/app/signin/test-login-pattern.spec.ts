import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TEST_LOGIN_PATTERN } from './test-login-pattern';

// How browsers evaluate the `pattern` attribute (HTML spec, "compiled pattern regular expression").
const htmlPattern = () => new RegExp(`^(?:${TEST_LOGIN_PATTERN})$`, 'v');

// The server-side check, read from the source so the two cannot drift apart silently.
function serverRegex(): RegExp {
  const source = readFileSync(fileURLToPath(new URL('../../auth.ts', import.meta.url)), 'utf8');
  const literal = /return (\/\^\[a-z0-9\\?-\]\{1,39\}\$\/)\.test\(login\)/.exec(source)?.[1];
  if (!literal) throw new Error('test-login regex not found in src/auth.ts');
  return new RegExp(literal.slice(1, -1));
}

const samples = [
  'alice',
  'a',
  'a-b',
  '-',
  '--',
  'a1-b2',
  '0',
  'a'.repeat(39),
  'a'.repeat(40),
  '',
  'Alice',
  'a_b',
  'a b',
  'a.b',
  'a\\b',
  'a/b',
  'é',
  'alice\n',
];

describe('TEST_LOGIN_PATTERN', () => {
  it("compiles under the HTML 'v' regex flag", () => {
    expect(htmlPattern).not.toThrow();
  });

  it.each(samples)('accepts/rejects %j like the server-side check', (login) => {
    expect(htmlPattern().test(login)).toBe(serverRegex().test(login));
  });

  it('accepts a hyphenated lowercase login and rejects an uppercase one', () => {
    expect(htmlPattern().test('mona-lisa-1')).toBe(true);
    expect(htmlPattern().test('Mona')).toBe(false);
  });
});
