import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { REDACT_PATHS } from './logger.options.js';

describe('log redaction (SEC-API-9)', () => {
  it('removes keys, tokens and cookies but keeps other headers', () => {
    let output = '';
    const sink = new Writable({
      write(chunk, _enc, cb) {
        output += String(chunk);
        cb();
      },
    });
    const logger = pino({ redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, sink);
    logger.info({
      req: {
        headers: {
          'x-api-key': 'mos_secret_key',
          authorization: 'Bearer eyJ.secret',
          cookie: 'session=abc',
          'user-agent': 'mos-cpp/0.1.0',
        },
      },
      res: { headers: { 'set-cookie': 'session=def' } },
    });
    expect(output).not.toMatch(/mos_secret_key|eyJ\.secret|session=abc|session=def/);
    expect(output).toContain('mos-cpp/0.1.0');
    expect(output.match(/\[REDACTED\]/g)).toHaveLength(4);
  });
});
