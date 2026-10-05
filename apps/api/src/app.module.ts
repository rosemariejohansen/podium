import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { loggerParams } from './common/logging/logger.options.js';
import { ENV, type Env } from './config/env.js';
import { EnvModule } from './config/env.module.js';
import { GamesModule } from './games/games.module.js';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    EnvModule,
    PrismaModule,
    RedisModule,
    LoggerModule.forRootAsync({ inject: [ENV], useFactory: (env: Env) => loggerParams(env) }),
    UsersModule,
    GamesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
