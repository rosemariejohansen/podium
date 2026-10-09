import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRedisClient } from './redis.module.js';

vi.mock('ioredis', async () => {
  const { EventEmitter: Emitter } = await import('node:events');
  class FakeRedis extends Emitter {
    constructor(
      readonly url: string,
      readonly options: unknown,
    ) {
      super();
    }
  }
  return { Redis: FakeRedis };
});

const URL_WITH_SECRET = 'redis://:s3cret-pass@redis.internal:6379';

describe('createRedisClient error logging', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T12:00:00Z'));
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function client(): EventEmitter {
    return createRedisClient({ REDIS_URL: URL_WITH_SECRET }) as unknown as EventEmitter;
  }

  it('does not throw on an error event and warns once with the message only', () => {
    const redis = client();
    expect(() =>
      redis.emit('error', new Error('connect ECONNREFUSED 127.0.0.1:6379')),
    ).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0]?.[0]);
    expect(line).toContain('connect ECONNREFUSED 127.0.0.1:6379');
    expect(line).not.toContain('s3cret-pass');
    expect(line).not.toContain(URL_WITH_SECRET);
  });

  it('logs repeated errors within 30 s once, then again once the window has passed', () => {
    const redis = client();
    redis.emit('error', new Error('boom 1'));
    vi.advanceTimersByTime(29_000);
    redis.emit('error', new Error('boom 2'));
    redis.emit('error', new Error('boom 3'));
    expect(warn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_000);
    redis.emit('error', new Error('boom 4'));
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[1]?.[0])).toContain('boom 4');
  });

  it('falls back to the error code when the message is empty', () => {
    const redis = client();
    redis.emit('error', Object.assign(new Error(''), { code: 'ECONNREFUSED' }));
    expect(String(warn.mock.calls[0]?.[0])).toContain('ECONNREFUSED');
  });

  it('logs "Redis connection restored" on ready after errors, and the next failure logs immediately', () => {
    const redis = client();
    redis.emit('error', new Error('down'));
    redis.emit('ready');
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]?.[0])).toBe('Redis connection restored');

    redis.emit('error', new Error('down again'));
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('stays silent on ready when there was no error', () => {
    const redis = client();
    redis.emit('ready');
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
