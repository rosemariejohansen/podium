import type { Params } from 'nestjs-pino';
import type { Env } from '../../config/env.js';
import { getRequestId } from '../http/request-id.js';

export const REDACT_PATHS = [
  'req.headers["x-api-key"]',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

export function loggerParams(env: Env): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      genReqId: (req) => getRequestId(req),
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
      autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { singleLine: true } }
          : undefined,
    },
  };
}
