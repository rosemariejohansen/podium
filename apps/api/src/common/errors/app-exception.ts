import { HttpException } from '@nestjs/common';
import { ERROR_HTTP_STATUS, type ErrorCode } from '@mos/contracts';

export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message, ERROR_HTTP_STATUS[code]);
  }
}
