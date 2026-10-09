import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { verifyServiceToken, type VerifiedServiceToken } from '@mos/service-token';
import type { Request } from 'express';
import { AppException } from '../common/errors/app-exception.js';
import { getRequestId } from '../common/http/request-id.js';
import { ENV, type Env } from '../config/env.js';

export const SYSTEM_TOKEN_ONLY = 'mos:system-token-only';

export type AuthedRequest = Request & { serviceToken: VerifiedServiceToken };

const invalid = (message: string) => new AppException('INVALID_SERVICE_TOKEN', message);

@Injectable()
export class ServiceTokenGuard implements CanActivate {
  private readonly logger = new Logger(ServiceTokenGuard.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const match = /^Bearer (\S+)$/.exec(req.header('authorization') ?? '');
    if (!match?.[1]) throw invalid('Missing service token');

    let token: VerifiedServiceToken;
    try {
      token = await verifyServiceToken(this.env.SERVICE_TOKEN_PUBLIC_KEY, match[1]);
    } catch (error) {
      // The client only learns 'Invalid service token'; operators get the reason here (a rotated
      // key, clock skew, a wrong audience). A missing header is probe noise and stays silent.
      // Only the reason is logged, never the token.
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Service token rejected (requestId ${getRequestId(req)}): ${reason}`);
      throw invalid('Invalid service token');
    }

    // System tokens are accepted only where explicitly allowed (SEC-WEB-2), and only there.
    const systemOnly = this.reflector.getAllAndOverride<boolean | undefined>(SYSTEM_TOKEN_ONLY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredScope = systemOnly ? 'system' : 'user';
    if (token.scope !== requiredScope) throw invalid(`A ${requiredScope} token is required`);

    req.serviceToken = token;
    return true;
  }
}
