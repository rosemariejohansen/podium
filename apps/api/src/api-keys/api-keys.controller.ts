import { Body, Delete, Get, Param, Post } from '@nestjs/common';
import {
  apiKeyCreateSchema,
  type ApiKeyCreatedDto,
  type ApiKeyCreateInput,
  type ApiKeyDto,
} from '@mos/contracts';
import { type Actor, CurrentActor, InternalController } from '../auth/auth.decorators.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { ApiKeysService } from './api-keys.service.js';

@InternalController()
export class ApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}

  @Get('games/:gameId/keys')
  list(@CurrentActor() actor: Actor, @Param('gameId') gameId: string): Promise<ApiKeyDto[]> {
    return this.keys.list(actor.userId, gameId);
  }

  @Post('games/:gameId/keys')
  create(
    @CurrentActor() actor: Actor,
    @Param('gameId') gameId: string,
    @Body(new ZodValidationPipe(apiKeyCreateSchema)) body: ApiKeyCreateInput,
  ): Promise<ApiKeyCreatedDto> {
    return this.keys.create(actor, gameId, body);
  }

  @Delete('keys/:id')
  revoke(@CurrentActor() actor: Actor, @Param('id') id: string): Promise<ApiKeyDto> {
    return this.keys.revoke(actor, id);
  }
}
