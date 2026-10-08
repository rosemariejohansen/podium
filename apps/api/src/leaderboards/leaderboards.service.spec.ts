import type { LeaderboardCreateInput, LeaderboardUpdateInput } from '@mos/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service.js';
import { DELETE_TIMEOUT_MS, type GamesService } from '../games/games.service.js';
import type { Leaderboard } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { LeaderboardsService } from './leaderboards.service.js';

const stored: Leaderboard = {
  id: 'b1',
  gameId: 'g1',
  slug: 'fastest',
  name: 'Fastest',
  sortOrder: 'ASC',
  unit: 'ms',
  minScore: null,
  maxScore: null,
  reviewMarginPct: 25,
  reviewMinEntries: 10,
  createdAt: new Date(0),
};

function setup() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ locked: 1 }]),
    leaderboard: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(stored),
      findUnique: vi.fn().mockResolvedValue(stored),
      update: vi.fn().mockResolvedValue(stored),
      delete: vi.fn().mockResolvedValue(stored),
    },
  };
  const prisma = {
    leaderboard: { findFirst: vi.fn().mockResolvedValue(stored) },
    $transaction: vi.fn((fn: (t: typeof tx) => unknown, _options?: object) => fn(tx)),
  };
  const audit = { record: vi.fn() };
  const games = { assertOwned: vi.fn() };
  const service = new LeaderboardsService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    games as unknown as GamesService,
  );
  return { service, prisma, tx, audit };
}

const actor = { userId: 'u1', ip: null };
// Simulate fields a later contract change could let through (ownership; FR-LB-2 fixes slug and sort order).
const extraCreateFields = { gameId: 'g2', id: 'forced' };
const extraUpdateFields = { ...extraCreateFields, slug: 'hijacked', sortOrder: 'DESC' };

describe('LeaderboardsService.create', () => {
  it('writes only the known create fields', async () => {
    const { service, tx } = setup();
    const input = {
      name: 'Fastest',
      slug: 'fastest',
      sortOrder: 'ASC',
      unit: 'ms',
      minScore: -5,
      maxScore: 600000,
      reviewMarginPct: 30,
      reviewMinEntries: 12,
      ...extraCreateFields,
    } as unknown as LeaderboardCreateInput;

    await service.create(actor, 'g1', input);

    expect(tx.leaderboard.create).toHaveBeenCalledOnce();
    expect(tx.leaderboard.create.mock.calls[0]?.[0].data).toStrictEqual({
      gameId: 'g1',
      name: 'Fastest',
      slug: 'fastest',
      sortOrder: 'ASC',
      unit: 'ms',
      minScore: -5n,
      maxScore: 600000n,
      reviewMarginPct: 30,
      reviewMinEntries: 12,
    });
  });
});

describe('LeaderboardsService.update', () => {
  it('writes only the known update fields and audits exactly those', async () => {
    const { service, tx, audit } = setup();
    const input = {
      name: 'Faster',
      unit: null,
      minScore: 1,
      maxScore: 2,
      reviewMarginPct: 50,
      reviewMinEntries: 5,
      ...extraUpdateFields,
    } as unknown as LeaderboardUpdateInput;

    await service.update(actor, 'b1', input);

    expect(tx.leaderboard.update).toHaveBeenCalledOnce();
    expect(tx.leaderboard.update.mock.calls[0]?.[0]).toMatchObject({ where: { id: 'b1' } });
    expect(tx.leaderboard.update.mock.calls[0]?.[0].data).toStrictEqual({
      name: 'Faster',
      unit: null,
      minScore: 1n,
      maxScore: 2n,
      reviewMarginPct: 50,
      reviewMinEntries: 5,
    });
    expect(audit.record.mock.calls[0]?.[1]).toMatchObject({
      action: 'LEADERBOARD_UPDATED',
      meta: {
        fields: ['name', 'unit', 'minScore', 'maxScore', 'reviewMarginPct', 'reviewMinEntries'],
      },
    });
  });

  it('audits only the fields a partial patch writes, including a cleared (null) one', async () => {
    const { service, audit } = setup();

    await service.update(actor, 'b1', { name: 'Faster', maxScore: null });

    expect(audit.record.mock.calls[0]?.[1].meta).toStrictEqual({ fields: ['name', 'maxScore'] });
  });
});

describe('LeaderboardsService writes on the locked row', () => {
  it('update checks the merged bounds against the row read under the lock', async () => {
    const { service, prisma, tx, audit } = setup();
    // A read before the lock still sees the unbounded board; a concurrent PATCH has since set maxScore.
    prisma.leaderboard.findFirst.mockResolvedValue(stored);
    tx.leaderboard.findUnique.mockResolvedValue({ ...stored, maxScore: 100n });

    await expect(service.update(actor, 'b1', { minScore: 200 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });

    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.leaderboard.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it.each(['update', 'remove'] as const)(
    '%s returns 404 and writes nothing when the locked lookup finds no owned board',
    async (method) => {
      const { service, tx, audit } = setup();
      tx.$queryRaw.mockResolvedValue([]);

      const call =
        method === 'update'
          ? service.update(actor, 'b1', { name: 'Faster' })
          : service.remove(actor, 'b1', 'Fastest');
      await expect(call).rejects.toMatchObject({ code: 'NOT_FOUND' });

      expect(tx.leaderboard.update).not.toHaveBeenCalled();
      expect(tx.leaderboard.delete).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    },
  );

  it('remove checks the confirmation against the locked row and uses the game delete timeout', async () => {
    const { service, prisma, tx } = setup();
    tx.leaderboard.findUnique.mockResolvedValue({ ...stored, name: 'Renamed' });

    await expect(service.remove(actor, 'b1', 'Fastest')).rejects.toMatchObject({
      code: 'CONFIRMATION_MISMATCH',
    });
    expect(tx.leaderboard.delete).not.toHaveBeenCalled();

    await service.remove(actor, 'b1', 'Renamed');
    expect(tx.leaderboard.delete).toHaveBeenCalledWith({ where: { id: 'b1' } });
    expect(prisma.$transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      timeout: DELETE_TIMEOUT_MS,
    });
  });
});
