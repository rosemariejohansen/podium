import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Redis } from 'ioredis';
import { withTimeout } from '../common/async/with-timeout.js';
import { AppException } from '../common/errors/app-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS } from '../redis/redis.module.js';

type DependencyState = 'up' | 'down';
const CHECK_TIMEOUT_MS = 2000;

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Pick<Redis, 'ping'>,
  ) {}

  @Get()
  liveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async readiness(): Promise<{ status: 'ready'; database: 'up'; redis: 'up' }> {
    const [database, redis] = (
      await Promise.allSettled([
        withTimeout(this.prisma.$queryRaw`SELECT 1`, CHECK_TIMEOUT_MS),
        withTimeout(this.redis.ping(), CHECK_TIMEOUT_MS),
      ])
    ).map((r): DependencyState => (r.status === 'fulfilled' ? 'up' : 'down'));
    if (database !== 'up' || redis !== 'up') {
      throw new AppException('SERVICE_UNAVAILABLE', 'Dependencies unavailable', {
        database,
        redis,
      });
    }
    return { status: 'ready', database, redis };
  }
}
