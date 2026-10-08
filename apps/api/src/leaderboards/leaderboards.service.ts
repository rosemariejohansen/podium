import { Injectable } from '@nestjs/common';
import type {
  LeaderboardCreateInput,
  LeaderboardDto,
  LeaderboardUpdateInput,
} from '@mos/contracts';
import { AuditService } from '../audit/audit.service.js';
import type { Actor } from '../auth/auth.decorators.js';
import { AppException } from '../common/errors/app-exception.js';
import { isUniqueViolation } from '../common/prisma/prisma-errors.js';
import { DELETE_TIMEOUT_MS, GamesService } from '../games/games.service.js';
import type { Leaderboard, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toBigIntOrNull, toLeaderboardDto } from './leaderboards.mapper.js';

export const MAX_LEADERBOARDS_PER_GAME = 20;

const notFound = () => new AppException('NOT_FOUND', 'Leaderboard not found');

/** The schema checks bounds within the patch; this checks the patch merged with the stored row. */
function assertMergedBounds(board: Leaderboard, input: LeaderboardUpdateInput): void {
  const stored = (value: bigint | null) => (value === null ? null : Number(value));
  const min = input.minScore !== undefined ? input.minScore : stored(board.minScore);
  const max = input.maxScore !== undefined ? input.maxScore : stored(board.maxScore);
  if (min !== null && max !== null && min > max) {
    throw new AppException('VALIDATION_FAILED', 'Validation failed', {
      issues: [{ path: 'maxScore', message: 'maxScore must be greater than or equal to minScore' }],
    });
  }
}

@Injectable()
export class LeaderboardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly games: GamesService,
  ) {}

  /** 404 unless the board exists and its game belongs to the user (SEC-API-13). */
  async assertOwnedBoard(userId: string, id: string): Promise<Leaderboard> {
    const board = await this.prisma.leaderboard.findFirst({
      where: { id, game: { ownerId: userId } },
    });
    if (!board) throw notFound();
    return board;
  }

  /**
   * The write-path form of assertOwnedBoard. Inside the caller's transaction, it locks the owned
   * board until commit and returns the current row, so checks made on that row still hold when
   * the write lands. Writers to one board queue here. A writer that waited reads what the other
   * committed, or gets 404 if the board was deleted meanwhile. The game row is locked first, with
   * KEY SHARE: a game delete locks the game and then its boards (by cascade), so a concurrent game
   * delete either waits for this transaction or ends it with a 404, never in a deadlock. Postgres
   * takes the row locks in the order of the FOR clauses, so keep `OF g` first. Neither lock
   * blocks the KEY SHARE locks that FK checks take, such as a score insert's.
   */
  async lockOwnedBoard(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
  ): Promise<Leaderboard> {
    const locked = await tx.$queryRaw<unknown[]>`
      SELECT 1 FROM "Leaderboard" l JOIN "Game" g ON g.id = l."gameId"
      WHERE l.id = ${id} AND g."ownerId" = ${userId}
      FOR KEY SHARE OF g FOR NO KEY UPDATE OF l`;
    if (locked.length === 0) throw notFound();
    // A new statement, so it sees what a writer we waited for has committed.
    const board = await tx.leaderboard.findUnique({ where: { id } });
    if (!board) throw notFound();
    return board;
  }

  async list(userId: string, gameId: string): Promise<LeaderboardDto[]> {
    await this.games.assertOwned(userId, gameId);
    const boards = await this.prisma.leaderboard.findMany({
      where: { gameId },
      // Oldest first; id breaks ties (rows inserted together share createdAt).
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return boards.map(toLeaderboardDto);
  }

  async create(
    actor: Actor,
    gameId: string,
    input: LeaderboardCreateInput,
  ): Promise<LeaderboardDto> {
    try {
      const board = await this.prisma.$transaction(async (tx) => {
        // Checks ownership and serialises creates on this game, so the quota count below cannot be
        // stale (PRD §7.3). NO KEY UPDATE conflicts with itself but not with the KEY SHARE locks that
        // FK checks take. A game deleted meanwhile matches no row here, so the caller gets 404.
        const owned = await tx.$queryRaw<unknown[]>`
          SELECT 1 FROM "Game" WHERE id = ${gameId} AND "ownerId" = ${actor.userId} FOR NO KEY UPDATE`;
        if (owned.length === 0) throw new AppException('NOT_FOUND', 'Game not found');
        if ((await tx.leaderboard.count({ where: { gameId } })) >= MAX_LEADERBOARDS_PER_GAME) {
          throw new AppException(
            'QUOTA_EXCEEDED',
            `A game can have at most ${MAX_LEADERBOARDS_PER_GAME} leaderboards`,
          );
        }
        const created = await tx.leaderboard.create({
          // Explicit fields: a future contract field must not flow into Prisma unnoticed.
          data: {
            gameId,
            name: input.name,
            slug: input.slug,
            sortOrder: input.sortOrder,
            unit: input.unit ?? null,
            minScore: toBigIntOrNull(input.minScore) ?? null,
            maxScore: toBigIntOrNull(input.maxScore) ?? null,
            reviewMarginPct: input.reviewMarginPct,
            reviewMinEntries: input.reviewMinEntries,
          },
        });
        await this.audit.record(tx, {
          actorId: actor.userId,
          gameId,
          action: 'LEADERBOARD_CREATED',
          targetType: 'leaderboard',
          targetId: created.id,
          ip: actor.ip,
          meta: { name: created.name, slug: created.slug },
        });
        return created;
      });
      return toLeaderboardDto(board);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException('SLUG_TAKEN', `This game already has a leaderboard "${input.slug}"`);
      }
      throw error;
    }
  }

  async update(actor: Actor, id: string, input: LeaderboardUpdateInput): Promise<LeaderboardDto> {
    // Explicit fields: a future contract field (slug or sortOrder, FR-LB-2) must not reach Prisma
    // unnoticed. Prisma skips undefined values, so omitted fields stay unchanged.
    const data = {
      name: input.name,
      unit: input.unit,
      minScore: toBigIntOrNull(input.minScore),
      maxScore: toBigIntOrNull(input.maxScore),
      reviewMarginPct: input.reviewMarginPct,
      reviewMinEntries: input.reviewMinEntries,
    } satisfies Prisma.LeaderboardUpdateInput;
    // The audit lists what is written (null = cleared), not whatever keys the body carried.
    const fields = Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([field]) => field);
    const updated = await this.prisma.$transaction(async (tx) => {
      // Checked on the locked row: two PATCHes that each set one bound cannot both pass (min <= max).
      const board = await this.lockOwnedBoard(tx, actor.userId, id);
      assertMergedBounds(board, input);
      const result = await tx.leaderboard.update({ where: { id }, data });
      await this.audit.record(tx, {
        actorId: actor.userId,
        gameId: board.gameId,
        action: 'LEADERBOARD_UPDATED',
        targetType: 'leaderboard',
        targetId: id,
        ip: actor.ip,
        meta: { fields },
      });
      return result;
    });
    return toLeaderboardDto(updated);
  }

  async remove(actor: Actor, id: string, confirm: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        // A second, concurrent DELETE waits here and then finds no row: 404, not a 500.
        const board = await this.lockOwnedBoard(tx, actor.userId, id);
        if (confirm !== board.name) {
          throw new AppException(
            'CONFIRMATION_MISMATCH',
            'Type the leaderboard name exactly to confirm deletion',
          );
        }
        await this.audit.record(tx, {
          actorId: actor.userId,
          gameId: board.gameId,
          action: 'LEADERBOARD_DELETED',
          targetType: 'leaderboard',
          targetId: id,
          ip: actor.ip,
          meta: { name: board.name, slug: board.slug },
        });
        // Cascades to the board's scores and reviews (FR-LB-6), hence the game delete's budget.
        await tx.leaderboard.delete({ where: { id } });
      },
      { timeout: DELETE_TIMEOUT_MS },
    );
  }
}
