import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { loggerParams } from './common/logging/logger.options.js';
import { ENV, type Env } from './config/env.js';
import { EnvModule } from './config/env.module.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [
    EnvModule,
    LoggerModule.forRootAsync({ inject: [ENV], useFactory: (env: Env) => loggerParams(env) }),
  ],
  controllers: [HealthController],
})
export class AppModule {}
