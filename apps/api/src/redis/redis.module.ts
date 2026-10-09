import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../config/env.js';

export const REDIS = Symbol('REDIS');

/** While the connection keeps failing, log at most one error per this window. */
const ERROR_LOG_INTERVAL_MS = 30_000;

export function createRedisClient(env: Pick<Env, 'REDIS_URL'>): Redis {
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 });
  const logger = new Logger('Redis');
  let lastErrorLogAt: number | undefined;

  // ioredis retries forever; without a listener every attempt prints 'Unhandled error event'.
  // Log the message only: the URL (with its password) never reaches the logs.
  redis.on('error', (error: Error & { code?: string }) => {
    const now = Date.now();
    if (lastErrorLogAt !== undefined && now - lastErrorLogAt < ERROR_LOG_INTERVAL_MS) return;
    lastErrorLogAt = now;
    logger.warn(`Redis connection error: ${error.message || error.code || error.name}`);
  });
  redis.on('ready', () => {
    if (lastErrorLogAt === undefined) return;
    lastErrorLogAt = undefined;
    logger.log('Redis connection restored');
  });

  return redis;
}

@Global()
@Module({
  providers: [{ provide: REDIS, inject: [ENV], useFactory: createRedisClient }],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Pick<Redis, 'quit'>) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
