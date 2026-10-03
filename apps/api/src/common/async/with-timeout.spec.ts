import { describe, expect, it } from 'vitest';
import { withTimeout } from './with-timeout.js';

describe('withTimeout', () => {
  it('resolves when the promise settles first', async () => {
    await expect(withTimeout(Promise.resolve(7), 50)).resolves.toBe(7);
  });
  it('rejects when the promise is too slow', async () => {
    await expect(withTimeout(new Promise(() => {}), 20)).rejects.toThrow(/timed out after 20 ms/);
  });
});
