import type { LeaderboardDto } from '@mos/contracts';
import type { Leaderboard } from '../generated/prisma/client.js';

// Bounds are validated as safe integers at the API boundary, so Number() is lossless here.
const toNumberOrNull = (value: bigint | null): number | null =>
  value === null ? null : Number(value);

/** undefined = leave unchanged, null = clear, number = set. */
export function toBigIntOrNull(value: number | null | undefined): bigint | null | undefined {
  if (value === undefined || value === null) return value;
  return BigInt(value);
}

export function toLeaderboardDto(board: Leaderboard): LeaderboardDto {
  return {
    id: board.id,
    gameId: board.gameId,
    name: board.name,
    slug: board.slug,
    sortOrder: board.sortOrder,
    unit: board.unit,
    minScore: toNumberOrNull(board.minScore),
    maxScore: toNumberOrNull(board.maxScore),
    reviewMarginPct: board.reviewMarginPct,
    reviewMinEntries: board.reviewMinEntries,
    createdAt: board.createdAt.toISOString(),
  };
}
