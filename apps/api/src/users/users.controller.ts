import { Body, Get, HttpCode, Post } from '@nestjs/common';
import { userSyncSchema, type UserDto, type UserSyncInput } from '@mos/contracts';
import { CurrentUserId, InternalController, SystemTokenOnly } from '../auth/auth.decorators.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { UsersService } from './users.service.js';

@InternalController()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post('users/sync')
  @HttpCode(200)
  @SystemTokenOnly()
  sync(@Body(new ZodValidationPipe(userSyncSchema)) body: UserSyncInput): Promise<UserDto> {
    return this.users.sync(body);
  }

  @Get('me')
  me(@CurrentUserId() userId: string): Promise<UserDto> {
    return this.users.me(userId);
  }
}
