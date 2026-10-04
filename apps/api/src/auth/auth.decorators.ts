import {
  applyDecorators,
  Controller,
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { type AuthedRequest, ServiceTokenGuard, SYSTEM_TOKEN_ONLY } from './service-token.guard.js';

/** Every /internal controller: service-token guard on, hidden from the public OpenAPI document. */
export const InternalController = () =>
  applyDecorators(Controller('internal'), UseGuards(ServiceTokenGuard), ApiExcludeController());

export const SystemTokenOnly = () => SetMetadata(SYSTEM_TOKEN_ONLY, true);

export const CurrentUserId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string =>
    ctx.switchToHttp().getRequest<AuthedRequest>().serviceToken.sub,
);

/** The end user's IP as reported by the web app inside the signed token (used by the audit log). */
export const ClientIp = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string | null =>
    ctx.switchToHttp().getRequest<AuthedRequest>().serviceToken.ip,
);
