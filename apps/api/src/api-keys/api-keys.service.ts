import { Inject, Injectable } from '@nestjs/common';
import type { ApiKeyCreatedDto, ApiKeyCreateInput, ApiKeyDto } from '@mos/contracts';
import type { Redis } from 'ioredis';
import { AuditService } from '../audit/audit.service.js';
import type { Actor } from '../auth/auth.decorators.js';
import { AppException } from '../common/errors/app-exception.js';
import { GamesService } from '../games/games.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS } from '../redis/redis.module.js';
import { apiKeyCacheKey } from './api-key-cache.js';
import { toApiKeyDto, toKeyScope } from './api-keys.mapper.js';
import { generateApiKey } from './key-format.js';

export const MAX_ACTIVE_KEYS_PER_GAME = 10;
const DAY_MS = 86_400_000;

/** Active = neither revoked nor expired; the same filter as `activeKeyCount` in games.mapper.ts. */
const activeWhere = (now: Date) => ({
  revokedAt: null,
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
});

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly games: GamesService,
    @Inject(REDIS) private readonly redis: Pick<Redis, 'del'>,
  ) {}

  async list(userId: string, gameId: string): Promise<ApiKeyDto[]> {
    await this.games.assertOwned(userId, gameId);
    const keys = await this.prisma.apiKey.findMany({
      where: { gameId },
      // Newest first; id breaks ties (rows inserted together share createdAt).
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const now = new Date();
    return keys.map((key) => toApiKeyDto(key, now));
  }

  async create(actor: Actor, gameId: string, input: ApiKeyCreateInput): Promise<ApiKeyCreatedDto> {
    const now = new Date();
    const { key, prefix, hash } = generateApiKey();
    const created = await this.prisma.$transaction(async (tx) => {
      // Checks ownership and serialises creates on this game, so the quota count below cannot be
      // stale (PRD §7.3). NO KEY UPDATE conflicts with itself but not with the KEY SHARE locks that
      // FK checks take. A game deleted meanwhile matches no row here, so the caller gets 404.
      const owned = await tx.$queryRaw<unknown[]>`
        SELECT 1 FROM "Game" WHERE id = ${gameId} AND "ownerId" = ${actor.userId} FOR NO KEY UPDATE`;
      if (owned.length === 0) throw new AppException('NOT_FOUND', 'Game not found');
      const active = await tx.apiKey.count({ where: { gameId, ...activeWhere(now) } });
      if (active >= MAX_ACTIVE_KEYS_PER_GAME) {
        throw new AppException(
          'QUOTA_EXCEEDED',
          `A game can have at most ${MAX_ACTIVE_KEYS_PER_GAME} active API keys`,
        );
      }
      const row = await tx.apiKey.create({
        // Explicit fields: a future contract field must not flow into Prisma unnoticed.
        data: {
          gameId,
          name: input.name,
          prefix,
          hash,
          scopes: input.scopes.map(toKeyScope),
          expiresAt:
            input.expiresInDays === null
              ? null
              : new Date(now.getTime() + input.expiresInDays * DAY_MS),
        },
      });
      await this.audit.record(tx, {
        actorId: actor.userId,
        gameId,
        action: 'KEY_CREATED',
        targetType: 'api_key',
        targetId: row.id,
        ip: actor.ip,
        // Never the key or its hash: the prefix is the only part that is ever shown again.
        meta: { name: row.name, prefix, scopes: input.scopes },
      });
      return row;
    });
    // The only place the plaintext key ever leaves the server (FR-KEY-2).
    return { ...toApiKeyDto(created, now), key };
  }

  async revoke(actor: Actor, keyId: string): Promise<ApiKeyDto> {
    const { row, hash } = await this.prisma.$transaction(async (tx) => {
      // Ownership join and row lock in one statement. A second, concurrent revoke waits here and
      // then reads the first one's revokedAt: 200 with the same DTO, not a 500 or a second audit
      // row. The game row is locked first, with KEY SHARE (same order as lockOwnedBoard): a game
      // delete locks the game and then its keys (by cascade), so it either waits for this
      // transaction or ends it with a 404, never in a deadlock.
      const locked = await tx.$queryRaw<unknown[]>`
        SELECT 1 FROM "ApiKey" k JOIN "Game" g ON g.id = k."gameId"
        WHERE k.id = ${keyId} AND g."ownerId" = ${actor.userId}
        FOR KEY SHARE OF g FOR NO KEY UPDATE OF k`;
      if (locked.length === 0) throw new AppException('NOT_FOUND', 'API key not found');
      // A new statement, so it sees what a revoke we waited for has committed.
      const key = await tx.apiKey.findUnique({ where: { id: keyId } });
      if (!key) throw new AppException('NOT_FOUND', 'API key not found');
      if (key.revokedAt) return { row: key, hash: key.hash };

      const updated = await tx.apiKey.update({
        where: { id: keyId },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(tx, {
        actorId: actor.userId,
        gameId: key.gameId,
        action: 'KEY_REVOKED',
        targetType: 'api_key',
        targetId: keyId,
        ip: actor.ip,
        meta: { name: key.name, prefix: key.prefix },
      });
      return { row: updated, hash: key.hash };
    });
    // After the commit, so a guard that misses the cache re-reads a row that is already revoked.
    // Also on a repeated revoke: if Redis was down on the first attempt (this DEL throws, the
    // caller gets a 500 although the key IS revoked in the database), a retry heals the cache.
    // Effective immediately, not after the 60 s cache TTL (FR-KEY-4, SEC-API-4).
    await this.redis.del(apiKeyCacheKey(hash));
    return toApiKeyDto(row);
  }
}
