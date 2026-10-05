import { Body, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  confirmSchema,
  gameCreateSchema,
  gameUpdateSchema,
  type ConfirmInput,
  type GameCreateInput,
  type GameDto,
  type GameUpdateInput,
} from '@mos/contracts';
import { type Actor, CurrentActor, InternalController } from '../auth/auth.decorators.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { GamesService } from './games.service.js';

@InternalController()
export class GamesController {
  constructor(private readonly games: GamesService) {}

  @Get('games')
  list(@CurrentActor() actor: Actor): Promise<GameDto[]> {
    return this.games.list(actor.userId);
  }

  @Post('games')
  create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(gameCreateSchema)) body: GameCreateInput,
  ): Promise<GameDto> {
    return this.games.create(actor, body);
  }

  @Get('games/:gameId')
  get(@CurrentActor() actor: Actor, @Param('gameId') gameId: string): Promise<GameDto> {
    return this.games.get(actor.userId, gameId);
  }

  @Patch('games/:gameId')
  update(
    @CurrentActor() actor: Actor,
    @Param('gameId') gameId: string,
    @Body(new ZodValidationPipe(gameUpdateSchema)) body: GameUpdateInput,
  ): Promise<GameDto> {
    return this.games.update(actor, gameId, body);
  }

  @Delete('games/:gameId')
  @HttpCode(204)
  remove(
    @CurrentActor() actor: Actor,
    @Param('gameId') gameId: string,
    @Body(new ZodValidationPipe(confirmSchema)) body: ConfirmInput,
  ): Promise<void> {
    return this.games.remove(actor, gameId, body.confirm);
  }
}
