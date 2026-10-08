import type { GameDto } from '@mos/contracts';
import type { Game, Prisma } from '../generated/prisma/client.js';

/** Relation counts for GameDto; "active" keys are neither revoked nor expired. */
export const gameCounts = () =>
  ({
    _count: {
      select: {
        leaderboards: true,
        apiKeys: {
          where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        },
      },
    },
  }) satisfies Prisma.GameInclude;

export type GameWithCounts = Game & { _count: { leaderboards: number; apiKeys: number } };

export function toGameDto(game: GameWithCounts): GameDto {
  return {
    id: game.id,
    name: game.name,
    slug: game.slug,
    description: game.description,
    isPublic: game.isPublic,
    createdAt: game.createdAt.toISOString(),
    leaderboardCount: game._count.leaderboards,
    activeKeyCount: game._count.apiKeys,
  };
}
