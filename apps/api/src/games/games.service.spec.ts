import type { GameUpdateInput } from '@mos/contracts';
import { describe, expect, it, vi } from 'vitest';
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
