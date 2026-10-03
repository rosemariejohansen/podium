import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { ApiErrorBody, ErrorCode } from '@mos/contracts';
import type { Request, Response } from 'express';
import { getRequestId } from '../http/request-id.js';
import { AppException } from './app-exception.js';

// Framework-raised HttpExceptions (unknown route, throttler, …) mapped onto our codes.
// Any other status stays 500 INTERNAL_ERROR: the PRD (§9.3) has no generic 4xx code, and our own
// code must throw AppException, so an unmapped HttpException is a programming error.
const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  400: 'VALIDATION_FAILED',
  404: 'NOT_FOUND',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

export function toErrorBody(
  exception: unknown,
  requestId: string,
): { status: number; body: ApiErrorBody } {
  if (exception instanceof AppException) {
    const error: ApiErrorBody['error'] = {
      code: exception.code,
      message: exception.message,
      requestId,
    };
    if (exception.details !== undefined) error.details = exception.details;
    return { status: exception.getStatus(), body: { error } };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const code = CODE_BY_STATUS[status];
    if (code) return { status, body: { error: { code, message: exception.message, requestId } } };
  }
  return {
    status: 500,
    body: { error: { code: 'INTERNAL_ERROR', message: 'Internal server error', requestId } },
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const { status, body } = toErrorBody(exception, getRequestId(req));
    if (status >= 500) {
      this.logger.error(
        exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
      );
    }
    res.status(status).json(body);
  }
}
