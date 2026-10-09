import { Inject, Injectable } from '@nestjs/common';
import type { GameCreateInput, GameDto, GameUpdateInput } from '@mos/contracts';
import type { Redis } from 'ioredis';
import { apiKeyCacheKey } from '../api-keys/api-key-cache.js';
import { AuditService } from '../audit/audit.service.js';
import type { Actor } from '../auth/auth.decorators.js';
import { AppException } from '../common/errors/app-exception.js';
import { isUniqueViolation } from '../common/prisma/prisma-errors.js';
import type { Game, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS } from '../redis/redis.module.js';
import { gameCounts, toGameDto } from './games.mapper.js';

export const MAX_GAMES_PER_USER = 10;

/**
 * Budget for the delete transaction (cascade to boards, players, scores, reviews, stats). Every
 * FK on that path leads an index (PRD §7.1; Score/ScoreReview playerId), so the cascade is fast;
 * this only keeps a safety margin over Prisma's 5 s interactive-transaction default (500 on expiry).
 * Shared with the leaderboard delete, whose cascade to scores and reviews has the same profile.
 */
export const DELETE_TIMEOUT_MS = 30_000;

const notFound = () => new AppException('NOT_FOUND', 'Game not found');

@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(REDIS) private readonly redis: Pick<Redis, 'del'>,
  ) {}

  /** 404 unless the game exists and belongs to the user (SEC-API-13). */
  async assertOwned(userId: string, gameId: string): Promise<Game> {
    const game = await this.prisma.game.findFirst({ where: { id: gameId, ownerId: userId } });
    if (!game) throw notFound();
    return game;
  }

  async list(userId: string): Promise<GameDto[]> {
    const games = await this.prisma.game.findMany({
      where: { ownerId: userId },
      // id breaks createdAt ties, so the list order is deterministic.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: gameCounts(),
    });
    return games.map(toGameDto);
  }

  async get(userId: string, gameId: string): Promise<GameDto> {
    const game = await this.prisma.game.findFirst({
      where: { id: gameId, ownerId: userId },
      include: gameCounts(),
    });
    if (!game) throw notFound();
    return toGameDto(game);
  }

  async create(actor: Actor, input: GameCreateInput): Promise<GameDto> {
    try {
      const game = await this.prisma.$transaction(async (tx) => {
        // Serialise creates by the same owner so the quota count below cannot be stale (PRD §7.3).
        // NO KEY UPDATE conflicts with itself but not with the KEY SHARE locks taken by FK checks.
        await tx.$queryRaw`SELECT 1 FROM "User" WHERE id = ${actor.userId} FOR NO KEY UPDATE`;
        const owned = await tx.game.count({ where: { ownerId: actor.userId } });
        if (owned >= MAX_GAMES_PER_USER) {
          throw new AppException(
            'QUOTA_EXCEEDED',
            `You can own at most ${MAX_GAMES_PER_USER} games`,
          );
        }
        const created = await tx.game.create({
          data: {
            ownerId: actor.userId,
            name: input.name,
            slug: input.slug,
            description: input.description ?? null,
          },
          include: gameCounts(),
        });
        await this.audit.record(tx, {
          actorId: actor.userId,
          gameId: created.id,
          action: 'GAME_CREATED',
          targetType: 'game',
          targetId: created.id,
          ip: actor.ip,
          meta: { name: created.name, slug: created.slug },
        });
        return created;
      });
      return toGameDto(game);
    } catch (error) {
      if (isUniqueViolation(error))
        throw new AppException('SLUG_TAKEN', `The slug "${input.slug}" is already taken`);
      throw error;
    }
  }

  async update(actor: Actor, gameId: string, input: GameUpdateInput): Promise<GameDto> {
    await this.assertOwned(actor.userId, gameId);
    // Explicit fields: a future contract field must not flow into Prisma unnoticed.
    // Prisma skips undefined values, so omitted fields stay unchanged.
    const data = {
      name: input.name,
      description: input.description,
      isPublic: input.isPublic,
    } satisfies Prisma.GameUpdateInput;
    // The audit lists what is written (null = cleared), not whatever keys the body carried.
    const fields = Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([field]) => field);
    const game = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.game.update({
        where: { id: gameId },
        data,
        include: gameCounts(),
      });
      await this.audit.record(tx, {
        actorId: actor.userId,
        gameId,
        action: 'GAME_UPDATED',
        targetType: 'game',
        targetId: gameId,
        ip: actor.ip,
        meta: { fields },
      });
      return updated;
    });
    return toGameDto(game);
  }

  async remove(actor: Actor, gameId: string, confirm: string): Promise<void> {
    const game = await this.assertOwned(actor.userId, gameId);
    if (confirm !== game.name) {
      throw new AppException(
        'CONFIRMATION_MISMATCH',
        'Type the game name exactly to confirm deletion',
      );
    }
    const hashes = await this.prisma.$transaction(
      async (tx) => {
        // Written first; the FK sets gameId to NULL when the game row is deleted (FR-GAME-3).
        await this.audit.record(tx, {
          actorId: actor.userId,
          gameId: game.id,
          action: 'GAME_DELETED',
          targetType: 'game',
          targetId: game.id,
          ip: actor.ip,
          meta: { name: game.name, slug: game.slug },
        });
        // Read before the cascade removes the key rows: after it the hashes are gone.
        const keys = await tx.apiKey.findMany({
          where: { gameId: game.id },
          select: { hash: true },
        });
        await tx.game.delete({ where: { id: game.id } });
        return keys.map((key) => key.hash);
      },
      { timeout: DELETE_TIMEOUT_MS },
    );
    // After the commit, so a guard that misses the cache re-reads rows that are already gone. The
    // keys stop working at once, not after the 60 s cache TTL (FR-KEY-4, SEC-API-4). One call for
    // all keys; none, no call. Same policy as ApiKeysService.revoke: a Redis failure here surfaces
    // as an error although the game IS deleted. A retry then answers 404 (harmless), but it cannot
    // clear the cache any more, since the hashes went with the rows: the entries expire by TTL.
    if (hashes.length > 0) await this.redis.del(...hashes.map(apiKeyCacheKey));
  }
}
