import { Body, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  confirmSchema,
  leaderboardCreateSchema,
  leaderboardUpdateSchema,
  type ConfirmInput,
  type LeaderboardCreateInput,
  type LeaderboardDto,
  type LeaderboardUpdateInput,
} from '@mos/contracts';
import { type Actor, CurrentActor, InternalController } from '../auth/auth.decorators.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { LeaderboardsService } from './leaderboards.service.js';

@InternalController()
export class LeaderboardsController {
  constructor(private readonly boards: LeaderboardsService) {}

  @Get('games/:gameId/leaderboards')
  list(@CurrentActor() actor: Actor, @Param('gameId') gameId: string): Promise<LeaderboardDto[]> {
    return this.boards.list(actor.userId, gameId);
  }

  @Post('games/:gameId/leaderboards')
  create(
    @CurrentActor() actor: Actor,
    @Param('gameId') gameId: string,
    @Body(new ZodValidationPipe(leaderboardCreateSchema)) body: LeaderboardCreateInput,
  ): Promise<LeaderboardDto> {
    return this.boards.create(actor, gameId, body);
  }

  @Patch('leaderboards/:id')
  update(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(leaderboardUpdateSchema)) body: LeaderboardUpdateInput,
  ): Promise<LeaderboardDto> {
    return this.boards.update(actor, id, body);
  }

  @Delete('leaderboards/:id')
  @HttpCode(204)
  remove(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(confirmSchema)) body: ConfirmInput,
  ): Promise<void> {
    return this.boards.remove(actor, id, body.confirm);
  }
}
