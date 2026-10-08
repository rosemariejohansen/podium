import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { GamesModule } from '../games/games.module.js';
import { LeaderboardsController } from './leaderboards.controller.js';
import { LeaderboardsService } from './leaderboards.service.js';

@Module({
  imports: [AuditModule, GamesModule],
  controllers: [LeaderboardsController],
  providers: [LeaderboardsService],
  exports: [LeaderboardsService],
})
export class LeaderboardsModule {}
