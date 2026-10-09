import 'server-only';
import type { ApiKeyCreatedDto, ApiKeyCreateInput, ApiKeyDto } from '@mos/contracts';
import { apiAuth, type UserContext } from '@/lib/session';
import { apiFetch } from './client';
import { pathSegment } from './path-segment';

const gameKeysPath = (gameId: string) => `/internal/games/${pathSegment(gameId)}/keys`;

export const listKeys = (ctx: UserContext, gameId: string) =>
  apiFetch<ApiKeyDto[]>(gameKeysPath(gameId), { auth: apiAuth(ctx) });

export const createKey = (ctx: UserContext, gameId: string, input: ApiKeyCreateInput) =>
  apiFetch<ApiKeyCreatedDto>(gameKeysPath(gameId), {
    method: 'POST',
    body: input,
    auth: apiAuth(ctx),
  });

export const revokeKey = (ctx: UserContext, keyId: string) =>
  apiFetch<ApiKeyDto>(`/internal/keys/${pathSegment(keyId)}`, {
    method: 'DELETE',
    auth: apiAuth(ctx),
  });
