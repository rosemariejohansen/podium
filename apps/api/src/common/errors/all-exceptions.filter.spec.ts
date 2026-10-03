import { ForbiddenException, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AppException } from './app-exception.js';
import { toErrorBody } from './all-exceptions.filter.js';

describe('toErrorBody', () => {
  it('maps AppException to its code, status and details', () => {
    const { status, body } = toErrorBody(
      new AppException('SLUG_TAKEN', 'Slug taken', { slug: 'x' }),
      'req_1',
    );
    expect(status).toBe(409);
    expect(body).toEqual({
      error: {
        code: 'SLUG_TAKEN',
        message: 'Slug taken',
        details: { slug: 'x' },
        requestId: 'req_1',
      },
    });
  });
  it('omits details when absent', () => {
    expect(
      toErrorBody(new AppException('NOT_FOUND', 'Game not found'), 'r').body.error,
    ).not.toHaveProperty('details');
  });
  it('maps Nest NotFoundException (unknown route) to NOT_FOUND', () => {
    const { status, body } = toErrorBody(new NotFoundException('Cannot GET /nope'), 'r');
    expect(status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });
  it('maps 413 to PAYLOAD_TOO_LARGE', () => {
    expect(toErrorBody(new PayloadTooLargeException(), 'r').body.error.code).toBe(
      'PAYLOAD_TOO_LARGE',
    );
  });
  it('treats unmapped framework HttpExceptions as INTERNAL_ERROR', () => {
    const { status, body } = toErrorBody(new ForbiddenException(), 'r');
    expect(status).toBe(500);
    expect(body.error).toMatchObject({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  });
  it('never leaks internal error messages', () => {
    const { status, body } = toErrorBody(new Error('password=hunter2 at db.ts:1'), 'r');
    expect(status).toBe(500);
    expect(body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error', requestId: 'r' },
    });
  });
});
