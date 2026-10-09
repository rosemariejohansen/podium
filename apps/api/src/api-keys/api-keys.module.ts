import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { GamesModule } from '../games/games.module.js';
import { ApiKeysController } from './api-keys.controller.js';
import { ApiKeysService } from './api-keys.service.js';

@Module({
  imports: [AuditModule, GamesModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
