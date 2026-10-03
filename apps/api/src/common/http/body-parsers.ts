import express, { type NextFunction, type Request, type Response } from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppException } from '../errors/app-exception.js';
import { toErrorBody } from '../errors/all-exceptions.filter.js';
import { getRequestId } from './request-id.js';

const v1Json = express.json({ limit: '4kb' });
const defaultJson = express.json({ limit: '64kb' });

/** SEC-API-8: 4 KB bodies on /v1, 64 KB elsewhere; parse errors use the standard error body. */
export function registerBodyParsers(app: NestExpressApplication): void {
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Express routing is case-insensitive, so the prefix match must be too (/V1 must not dodge 4 KB).
    const path = req.path.toLowerCase();
    const parser = path === '/v1' || path.startsWith('/v1/') ? v1Json : defaultJson;
    parser(req, res, next);
  });
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    const type = (err as { type?: unknown } | null)?.type;
    if (typeof type !== 'string') return next(err);
    const exception =
      type === 'entity.too.large'
        ? new AppException('PAYLOAD_TOO_LARGE', 'Request body is too large')
        : new AppException('VALIDATION_FAILED', 'Request body could not be parsed');
    const { status, body } = toErrorBody(exception, getRequestId(req));
    res.status(status).json(body);
  });
}
