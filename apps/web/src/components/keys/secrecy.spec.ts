import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** Every non-spec source file that handles the new key between the form and the dialog. */
function keyFlowSources(): Map<string, string> {
  const sources = new Map<string, string>();
  for (const dir of ['.', '../../app/dashboard/games/[gameId]/keys']) {
    for (const file of readdirSync(src(dir))) {
      if (/\.tsx?$/.test(file) && !file.endsWith('.spec.ts')) {
        sources.set(`${dir}/${file}`, readFileSync(src(`${dir}/${file}`), 'utf8'));
      }
    }
  }
  for (const file of ['../../lib/api/keys.ts', '../../lib/forms/key-create.ts']) {
    sources.set(file, readFileSync(src(file), 'utf8'));
  }
  return sources;
}

const withoutComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// SEC-WEB-10: the full key is never written to a URL, a cookie, a log, a client-side cache or
// anything else that outlives the dialog. The behaviour tests cover the action and the form;
// this guards the files against a quiet addition of one of those channels.
describe('plaintext key hygiene (SEC-WEB-10)', () => {
  const channels: [string, RegExp][] = [
    ['browser storage', /\b(localStorage|sessionStorage|indexedDB|caches)\b/],
    ['cookies', /document\.cookie|\bcookies\s*\(/],
    ['logging', /\bconsole\s*\./],
    [
      'a URL',
      /\b(redirect|permanentRedirect)\s*\(|\brouter\s*\.\s*(push|replace)\b|\bsearchParams\b|\blocation\s*\.|\bhistory\s*\./,
    ],
  ];

  it('finds the key-flow files', () => {
    const names = [...keyFlowSources().keys()];
    expect(names).toEqual(
      expect.arrayContaining([
        './key-create-form.tsx',
        './key-reveal-dialog.tsx',
        './revoke-key-button.tsx',
        '../../app/dashboard/games/[gameId]/keys/actions.ts',
        '../../app/dashboard/games/[gameId]/keys/page.tsx',
      ]),
    );
  });

  it.each(channels)('does not use %s', (_channel, pattern) => {
    for (const [name, code] of keyFlowSources()) {
      expect(withoutComments(code), name).not.toMatch(pattern);
    }
  });
});
