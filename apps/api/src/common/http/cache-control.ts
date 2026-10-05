import type { NextFunction, Request, Response } from 'express';

const isUnder = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/** PRD §9.2: /v1 and /internal responses, errors included, are never cached. */
export function noStoreForPrivateApis(req: Request, res: Response, next: NextFunction): void {
  // Express routing is case-insensitive, so the prefix match must be too (/V1 reaches /v1 routes).
  const path = req.path.toLowerCase();
  if (isUnder(path, '/v1') || isUnder(path, '/internal')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
}
