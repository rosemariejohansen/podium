import type { GameUpdateInput } from '@mos/contracts';
import { describe, expect, it, vi } from 'vitest';
import { apiKeyCacheKey } from '../api-keys/api-key-cache.js';
import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { GamesService } from './games.service.js';

describe('GamesService.update', () => {
  it('writes only the known update fields, so a future contract field cannot reach Prisma', async () => {
    const game = {
      id: 'g1',
      ownerId: 'u1',
      name: 'A',
      slug: 'a',
      description: null,
      isPublic: true,
      createdAt: new Date(0),
      _count: { leaderboards: 0, apiKeys: 0 },
    };
    const update = vi.fn().mockResolvedValue(game);
    const tx = { game: { update } };
    const prisma = {
      game: { findFirst: vi.fn().mockResolvedValue(game) },
      $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    };
    const audit = { record: vi.fn() };
    const service = new GamesService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      { del: vi.fn() } as never,
    );
    // Simulates fields a later gameUpdateSchema change could let through (FR-GAME-4, ownership).
    const input = {
      name: 'B',
      description: null,
      isPublic: false,
      slug: 'hijacked',
      ownerId: 'u2',
    } as unknown as GameUpdateInput;

    await service.update({ userId: 'u1', ip: null }, 'g1', input);

    expect(update).toHaveBeenCalledOnce();
    expect(update.mock.calls[0]?.[0]).toMatchObject({ where: { id: 'g1' } });
    expect(update.mock.calls[0]?.[0].data).toStrictEqual({
      name: 'B',
      description: null,
      isPublic: false,
    });
  });
});

describe('GamesService.remove', () => {
  const game = { id: 'g1', ownerId: 'u1', name: 'Asteroids', slug: 'asteroids' };
  const actor = { userId: 'u1', ip: '203.0.113.10' };

  function setup(hashes: string[]) {
    // The order in which the service reaches the database and Redis.
    const events: string[] = [];
    const tx = {
      apiKey: {
        findMany: vi.fn().mockImplementation(() => {
          events.push('read-hashes');
          return Promise.resolve(hashes.map((hash) => ({ hash })));
        }),
      },
      game: {
        delete: vi.fn().mockImplementation(() => {
          events.push('delete-game');
          return Promise.resolve(game);
        }),
      },
    };
    const prisma = {
      game: { findFirst: vi.fn().mockResolvedValue(game) },
      // Like Prisma, resolves only after the callback has finished.
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown, _options?: object) => {
        const result = await fn(tx);
        events.push('commit');
        return result;
      }),
    };
    const audit = {
      record: vi.fn().mockImplementation(() => {
        events.push('audit');
        return Promise.resolve();
      }),
    };
    const redis = {
      del: vi.fn().mockImplementation(() => {
        events.push('del');
        return Promise.resolve(hashes.length);
      }),
    };
    const service = new GamesService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      redis as never,
    );
    return { service, prisma, tx, audit, redis, events };
  }

  it('reads the hashes of the game’s keys in the transaction before the cascade, and deletes their cache entries in one call after the commit', async () => {
    const { service, tx, redis, events } = setup(['h1', 'h2']);

    await service.remove(actor, 'g1', 'Asteroids');

    expect(tx.apiKey.findMany).toHaveBeenCalledOnce();
    expect(tx.apiKey.findMany.mock.calls[0]?.[0]).toStrictEqual({
      where: { gameId: 'g1' },
      select: { hash: true },
    });
    expect(redis.del).toHaveBeenCalledOnce();
    expect(redis.del).toHaveBeenCalledWith(apiKeyCacheKey('h1'), apiKeyCacheKey('h2'));
    expect(events.indexOf('read-hashes')).toBeLessThan(events.indexOf('delete-game'));
    expect(events.indexOf('delete-game')).toBeLessThan(events.indexOf('commit'));
    expect(events.slice(-2)).toEqual(['commit', 'del']);
  });

  it('makes no Redis call when the game has no keys', async () => {
    const { service, tx, redis } = setup([]);

    await service.remove(actor, 'g1', 'Asteroids');

    expect(tx.game.delete).toHaveBeenCalledOnce();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('does not touch Redis when the transaction fails', async () => {
    const { service, prisma, redis } = setup(['h1']);
    prisma.$transaction.mockRejectedValueOnce(new Error('deadlock detected'));

    await expect(service.remove(actor, 'g1', 'Asteroids')).rejects.toThrow('deadlock detected');

    expect(redis.del).not.toHaveBeenCalled();
  });

  it('does not read keys, delete or touch Redis when the confirmation does not match', async () => {
    const { service, prisma, tx, redis } = setup(['h1']);

    await expect(service.remove(actor, 'g1', 'asteroids')).rejects.toMatchObject({
      code: 'CONFIRMATION_MISMATCH',
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.apiKey.findMany).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('propagates a Redis failure after the commit: the game is already deleted', async () => {
    const { service, tx, redis, events } = setup(['h1']);
    const down = new Error('Connection is closed.');
    redis.del.mockRejectedValueOnce(down);

    await expect(service.remove(actor, 'g1', 'Asteroids')).rejects.toBe(down);

    expect(tx.game.delete).toHaveBeenCalledOnce();
    expect(events.slice(-2)).toEqual(['delete-game', 'commit']);
    expect(redis.del).toHaveBeenCalledOnce();
  });
});
