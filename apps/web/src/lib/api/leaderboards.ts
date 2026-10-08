import 'server-only';
import type {
  LeaderboardCreateInput,
  LeaderboardDto,
  LeaderboardUpdateInput,
} from '@mos/contracts';
import { apiAuth, type UserContext } from '@/lib/session';
import { apiFetch } from './client';
import { pathSegment } from './path-segment';

const boardPath = (id: string) => `/internal/leaderboards/${pathSegment(id)}`;

export const listLeaderboards = (ctx: UserContext, gameId: string) =>
  apiFetch<LeaderboardDto[]>(`/internal/games/${pathSegment(gameId)}/leaderboards`, {
    auth: apiAuth(ctx),
  });

export const createLeaderboard = (
  ctx: UserContext,
  gameId: string,
  input: LeaderboardCreateInput,
) =>
  apiFetch<LeaderboardDto>(`/internal/games/${pathSegment(gameId)}/leaderboards`, {
    method: 'POST',
    body: input,
    auth: apiAuth(ctx),
  });

export const updateLeaderboard = (ctx: UserContext, id: string, input: LeaderboardUpdateInput) =>
  apiFetch<LeaderboardDto>(boardPath(id), { method: 'PATCH', body: input, auth: apiAuth(ctx) });

export const deleteLeaderboard = (ctx: UserContext, id: string, confirm: string) =>
  apiFetch<void>(boardPath(id), { method: 'DELETE', body: { confirm }, auth: apiAuth(ctx) });
