import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { NextFunction, Request, Response } from 'express';

const VALID_REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Accepts a well-formed incoming X-Request-Id, otherwise generates one; echoes it back. */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const id =
    incoming && VALID_REQUEST_ID.test(incoming)
      ? incoming
      : `req_${randomUUID().replaceAll('-', '')}`;
  (req as IncomingMessage & { id: string }).id = id;
  res.setHeader('X-Request-Id', id);
  next();
}

export function getRequestId(req: IncomingMessage): string {
  const id = (req as IncomingMessage & { id?: unknown }).id;
  return typeof id === 'string' ? id : 'unknown';
}
