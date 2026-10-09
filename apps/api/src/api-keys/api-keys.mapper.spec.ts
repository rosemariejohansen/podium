import { describe, expect, it } from 'vitest';
import { fromKeyScope, keyStatus, toApiKeyDto, toKeyScope } from './api-keys.mapper.js';

const NOW = new Date('2026-10-03T12:00:00Z');
const base = {
  id: 'k1',
  gameId: 'g1',
  name: 'prod',
  prefix: 'mos_abcdefgh',
  hash: 'h',
  scopes: ['SCORES_READ', 'SCORES_WRITE'] as ('SCORES_READ' | 'SCORES_WRITE')[],
  expiresAt: null as Date | null,
  lastUsedAt: null as Date | null,
  revokedAt: null as Date | null,
  createdAt: new Date('2026-10-01T00:00:00Z'),
};

describe('api-keys mapper', () => {
  it('maps scopes both ways', () => {
    expect(toKeyScope('scores:write')).toBe('SCORES_WRITE');
    expect(fromKeyScope('SCORES_READ')).toBe('scores:read');
  });
  it('computes status: revoked beats expired beats active', () => {
    expect(keyStatus(base, NOW)).toBe('active');
    expect(keyStatus({ ...base, expiresAt: new Date('2026-10-03T11:59:59Z') }, NOW)).toBe(
      'expired',
    );
    expect(keyStatus({ ...base, expiresAt: new Date('2026-10-04T00:00:00Z') }, NOW)).toBe('active');
    expect(keyStatus({ ...base, revokedAt: NOW, expiresAt: new Date('2020-01-01') }, NOW)).toBe(
      'revoked',
    );
  });
  it('never exposes the hash', () => {
    const dto = toApiKeyDto(base, NOW);
    expect(dto).not.toHaveProperty('hash');
    expect(dto).toEqual({
      id: 'k1',
      gameId: 'g1',
      name: 'prod',
      prefix: 'mos_abcdefgh',
      scopes: ['scores:read', 'scores:write'],
      status: 'active',
      createdAt: '2026-10-01T00:00:00.000Z',
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
    });
  });
});
