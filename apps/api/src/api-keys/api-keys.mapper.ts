import type { ApiKeyDto, ApiKeyStatus, KeyScope } from '@mos/contracts';
import type { ApiKey, KeyScope as DbKeyScope } from '../generated/prisma/client.js';

const TO_DB: Record<KeyScope, DbKeyScope> = {
  'scores:read': 'SCORES_READ',
  'scores:write': 'SCORES_WRITE',
};
const FROM_DB: Record<DbKeyScope, KeyScope> = {
  SCORES_READ: 'scores:read',
  SCORES_WRITE: 'scores:write',
};

export const toKeyScope = (scope: KeyScope): DbKeyScope => TO_DB[scope];
export const fromKeyScope = (scope: DbKeyScope): KeyScope => FROM_DB[scope];

export function keyStatus(
  key: Pick<ApiKey, 'revokedAt' | 'expiresAt'>,
  now: Date = new Date(),
): ApiKeyStatus {
  if (key.revokedAt) return 'revoked';
  if (key.expiresAt && key.expiresAt <= now) return 'expired';
  return 'active';
}

export function toApiKeyDto(key: ApiKey, now: Date = new Date()): ApiKeyDto {
  return {
    id: key.id,
    gameId: key.gameId,
    name: key.name,
    prefix: key.prefix,
    scopes: key.scopes.map(fromKeyScope),
    status: keyStatus(key, now),
    createdAt: key.createdAt.toISOString(),
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
  };
}
