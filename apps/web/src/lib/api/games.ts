import 'server-only';
import type { GameCreateInput, GameDto, GameUpdateInput } from '@mos/contracts';
import { cache } from 'react';
import { apiAuth, type UserContext } from '@/lib/session';
import { apiFetch } from './client';
import { pathSegment } from './path-segment';

const gamePath = (id: string) => `/internal/games/${pathSegment(id)}`;

export const listGames = (ctx: UserContext) =>
  apiFetch<GameDto[]>('/internal/games', { auth: apiAuth(ctx) });

/**
 * One API call per request: a game's layout and its page both read the game. React `cache`
 * compares arguments by identity, and `requireUser()` returns a new context object on every
 * call, so the cache is keyed on the primitives inside the context.
 */
const fetchGame = cache((userId: string, ip: string | null, id: string) =>
  apiFetch<GameDto>(gamePath(id), { auth: { userId, ip } }),
);

export const getGame = (ctx: UserContext, id: string) => fetchGame(ctx.userId, ctx.ip, id);

export const createGame = (ctx: UserContext, input: GameCreateInput) =>
  apiFetch<GameDto>('/internal/games', { method: 'POST', body: input, auth: apiAuth(ctx) });

export const updateGame = (ctx: UserContext, id: string, input: GameUpdateInput) =>
  apiFetch<GameDto>(gamePath(id), { method: 'PATCH', body: input, auth: apiAuth(ctx) });

export const deleteGame = (ctx: UserContext, id: string, confirm: string) =>
  apiFetch<void>(gamePath(id), { method: 'DELETE', body: { confirm }, auth: apiAuth(ctx) });
