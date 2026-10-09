import type { ApiKeyCreateInput } from '@mos/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service.js';
import type { GamesService } from '../games/games.service.js';
import type { ApiKey } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { apiKeyCacheKey } from './api-key-cache.js';
import { ApiKeysService, MAX_ACTIVE_KEYS_PER_GAME } from './api-keys.service.js';
import { API_KEY_PREFIX_LENGTH, hashApiKey, parseApiKey } from './key-format.js';

const DAY_MS = 86_400_000;

const stored: ApiKey = {
  id: 'k1',
  gameId: 'g1',
  name: 'prod',
  prefix: 'mos_abcdefgh',
  hash: 'f'.repeat(64),
  scopes: ['SCORES_READ', 'SCORES_WRITE'],
  expiresAt: null,
  lastUsedAt: null,
  revokedAt: null,
  createdAt: new Date('2026-10-01T00:00:00Z'),
};

const actor = { userId: 'u1', ip: '203.0.113.10' };

function setup() {
  // The order in which the service reaches the database and Redis, for the commit-then-DEL checks.
  const events: string[] = [];
  const tx = {
    $queryRaw: vi.fn().mockImplementation(() => {
      events.push('lock');
      return Promise.resolve([{ locked: 1 }]);
    }),
    apiKey: {
      count: vi.fn().mockImplementation(() => {
        events.push('count');
        return Promise.resolve(0);
      }),
      create: vi
        .fn()
        .mockImplementation(({ data }: { data: object }) =>
          Promise.resolve({ ...stored, ...data, id: 'k2', createdAt: new Date() }),
        ),
      // Both read shapes, so the checks below do not depend on which one the service picks.
      findUnique: vi.fn().mockResolvedValue(stored),
      findFirst: vi.fn().mockResolvedValue(stored),
      update: vi
        .fn()
        .mockImplementation(({ data }: { data: object }) =>
          Promise.resolve({ ...stored, ...data }),
        ),
    },
  };
  const prisma = {
    apiKey: {
      findUnique: vi.fn().mockResolvedValue(stored),
      findFirst: vi.fn().mockResolvedValue(stored),
      findMany: vi.fn().mockResolvedValue([]),
    },
    // Like Prisma, resolves only after the callback has finished: the "commit" event comes after
    // everything the service did through tx.
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
  const games = { assertOwned: vi.fn().mockResolvedValue({ id: 'g1', ownerId: 'u1' }) };
  const redis = {
    del: vi.fn().mockImplementation(() => {
      events.push('del');
      return Promise.resolve(1);
    }),
  };
  const service = new ApiKeysService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    games as unknown as GamesService,
    redis as never,
  );
  return { service, prisma, tx, audit, redis, events };
}

/** SQL text and bound values of every $queryRaw tagged-template call on `mock`. */
function rawSql(mock: { mock: { calls: unknown[][] } }) {
  return {
    text: mock.mock.calls.map(([strings]) => (strings as readonly string[]).join('?')).join('\n'),
    values: mock.mock.calls.flatMap((call) => call.slice(1)),
  };
}

const input: ApiKeyCreateInput = {
  name: 'prod',
  scopes: ['scores:write', 'scores:read'],
  expiresInDays: 30,
};
// Fields a later contract change could let through: ownership, identity, secrets, lifecycle.
const extraFields = {
  gameId: 'g2',
  id: 'forced',
  hash: 'chosen-by-client',
  prefix: 'mos_forged00',
  revokedAt: new Date(0),
  lastUsedAt: new Date(0),
  createdAt: new Date(0),
};

describe('ApiKeysService.create', () => {
  it('writes only the known fields, with the generated prefix and hash and the mapped scopes', async () => {
    const { service, tx } = setup();
    const before = Date.now();

    const created = await service.create(actor, 'g1', {
      ...input,
      ...extraFields,
    } as unknown as ApiKeyCreateInput);

    const after = Date.now();
    expect(tx.apiKey.create).toHaveBeenCalledOnce();
    const data = tx.apiKey.create.mock.calls[0]?.[0].data;
    expect(data).toStrictEqual({
      gameId: 'g1',
      name: 'prod',
      prefix: created.key.slice(0, API_KEY_PREFIX_LENGTH),
      hash: hashApiKey(created.key),
      scopes: ['SCORES_WRITE', 'SCORES_READ'],
      expiresAt: expect.any(Date),
    });
    expect(data.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 30 * DAY_MS);
    expect(data.expiresAt.getTime()).toBeLessThanOrEqual(after + 30 * DAY_MS);
  });

  it('stores a null expiry when the key never expires', async () => {
    const { service, tx } = setup();

    await service.create(actor, 'g1', { ...input, expiresInDays: null });

    expect(tx.apiKey.create.mock.calls[0]?.[0].data.expiresAt).toBeNull();
  });

  it('returns the plaintext key once, valid and matching what was stored, and never the hash', async () => {
    const { service, tx } = setup();

    const created = await service.create(actor, 'g1', input);

    expect(parseApiKey(created.key)).toBe(true);
    expect(created).toMatchObject({
      id: 'k2',
      gameId: 'g1',
      name: 'prod',
      prefix: created.key.slice(0, API_KEY_PREFIX_LENGTH),
      scopes: ['scores:write', 'scores:read'],
      status: 'active',
      revokedAt: null,
    });
    expect(created).not.toHaveProperty('hash');
    expect(JSON.stringify(created)).not.toContain(tx.apiKey.create.mock.calls[0]?.[0].data.hash);
  });

  it('locks the owned game row FOR NO KEY UPDATE inside the transaction, before counting', async () => {
    const { service, prisma, tx, events } = setup();

    await service.create(actor, 'g1', input);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(events.indexOf('lock')).toBeGreaterThanOrEqual(0);
    expect(events.indexOf('lock')).toBeLessThan(events.indexOf('count'));
    const { text, values } = rawSql(tx.$queryRaw);
    expect(text).toContain('"Game"');
    expect(text).toMatch(/FOR NO KEY UPDATE/);
    // Ownership is part of the locking statement, so a game deleted meanwhile is a 404 (below).
    expect(values).toEqual(expect.arrayContaining(['g1', 'u1']));
  });

  it('returns 404 and writes nothing when the locking statement finds no owned game', async () => {
    const { service, tx, audit } = setup();
    tx.$queryRaw.mockResolvedValue([]);

    await expect(service.create(actor, 'g1', input)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(tx.apiKey.count).not.toHaveBeenCalled();
    expect(tx.apiKey.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('counts only this game’s active keys: not revoked, and not expired', async () => {
    const { service, tx } = setup();

    await service.create(actor, 'g1', input);

    expect(tx.apiKey.count).toHaveBeenCalledOnce();
    expect(tx.apiKey.count.mock.calls[0]?.[0]).toStrictEqual({
      where: {
        gameId: 'g1',
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
      },
    });
  });

  it(`allows the ${MAX_ACTIVE_KEYS_PER_GAME}th active key and rejects the ${MAX_ACTIVE_KEYS_PER_GAME + 1}th without writing`, async () => {
    expect(MAX_ACTIVE_KEYS_PER_GAME).toBe(10);
    const allowed = setup();
    allowed.tx.apiKey.count.mockResolvedValue(MAX_ACTIVE_KEYS_PER_GAME - 1);
    await expect(allowed.service.create(actor, 'g1', input)).resolves.toBeDefined();

    const full = setup();
    full.tx.apiKey.count.mockResolvedValue(MAX_ACTIVE_KEYS_PER_GAME);
    await expect(full.service.create(actor, 'g1', input)).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
    });
    expect(full.tx.apiKey.create).not.toHaveBeenCalled();
    expect(full.audit.record).not.toHaveBeenCalled();
  });

  it('audits in the same transaction with actor, game, ip and meta, and never the key or hash', async () => {
    const { service, tx, audit } = setup();

    const created = await service.create(actor, 'g1', input);

    expect(audit.record).toHaveBeenCalledOnce();
    const [auditTx, entry] = audit.record.mock.calls[0] ?? [];
    expect(auditTx).toBe(tx);
    expect(entry).toStrictEqual({
      actorId: 'u1',
      gameId: 'g1',
      action: 'KEY_CREATED',
      targetType: 'api_key',
      targetId: 'k2',
      ip: '203.0.113.10',
      meta: {
        name: 'prod',
        prefix: created.key.slice(0, API_KEY_PREFIX_LENGTH),
        scopes: ['scores:write', 'scores:read'],
      },
    });
    const text = JSON.stringify(entry);
    expect(text).not.toContain(created.key.slice(API_KEY_PREFIX_LENGTH));
    expect(text).not.toContain(hashApiKey(created.key));
  });
});

describe('ApiKeysService.revoke', () => {
  it('locks the key row through its game, game first, inside the transaction', async () => {
    const { service, prisma, tx } = setup();

    await service.revoke(actor, 'k1');

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    const { text, values } = rawSql(tx.$queryRaw);
    expect(text).toContain('"ApiKey"');
    expect(text).toContain('"Game"');
    // KEY SHARE on the game first, like lockOwnedBoard: a game delete cannot deadlock with us.
    expect(text).toMatch(/FOR KEY SHARE[\s\S]*FOR NO KEY UPDATE/);
    expect(values).toEqual(expect.arrayContaining(['k1', 'u1']));
  });

  it('returns 404 and writes nothing when the locking statement finds no owned key', async () => {
    const { service, tx, audit, redis } = setup();
    tx.$queryRaw.mockResolvedValue([]);

    await expect(service.revoke(actor, 'k1')).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(tx.apiKey.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('writes only revokedAt and audits actor, game, ip and the key’s name and prefix', async () => {
    const { service, tx, audit } = setup();

    await service.revoke(actor, 'k1');

    expect(tx.apiKey.update).toHaveBeenCalledOnce();
    expect(tx.apiKey.update.mock.calls[0]?.[0]).toStrictEqual({
      where: { id: 'k1' },
      data: { revokedAt: expect.any(Date) },
    });
    expect(audit.record).toHaveBeenCalledOnce();
    const [auditTx, entry] = audit.record.mock.calls[0] ?? [];
    expect(auditTx).toBe(tx);
    expect(entry).toStrictEqual({
      actorId: 'u1',
      gameId: 'g1',
      action: 'KEY_REVOKED',
      targetType: 'api_key',
      targetId: 'k1',
      ip: '203.0.113.10',
      meta: { name: 'prod', prefix: 'mos_abcdefgh' },
    });
    expect(JSON.stringify(entry)).not.toContain(stored.hash);
  });

  it('returns the revoked DTO without the hash', async () => {
    const { service } = setup();

    const revoked = await service.revoke(actor, 'k1');

    expect(revoked).toMatchObject({ id: 'k1', gameId: 'g1', status: 'revoked' });
    expect(revoked.revokedAt).toEqual(expect.any(String));
    expect(revoked).not.toHaveProperty('hash');
    expect(revoked).not.toHaveProperty('key');
    expect(JSON.stringify(revoked)).not.toContain(stored.hash);
  });

  it('deletes apikey:<hash> from Redis only after the transaction has committed', async () => {
    const { service, redis, events } = setup();

    await service.revoke(actor, 'k1');

    expect(redis.del).toHaveBeenCalledOnce();
    expect(redis.del).toHaveBeenCalledWith(apiKeyCacheKey(stored.hash));
    expect(redis.del).toHaveBeenCalledWith(`apikey:${stored.hash}`);
    expect(events.indexOf('audit')).toBeLessThan(events.indexOf('commit'));
    expect(events.slice(-2)).toEqual(['commit', 'del']);
  });

  it('does not touch Redis when the transaction fails', async () => {
    const { service, prisma, redis } = setup();
    prisma.$transaction.mockRejectedValueOnce(new Error('deadlock detected'));

    await expect(service.revoke(actor, 'k1')).rejects.toThrow('deadlock detected');

    expect(redis.del).not.toHaveBeenCalled();
  });

  it('answers a key that is already revoked with its stored revoked DTO and writes nothing', async () => {
    const { service, prisma, tx, audit } = setup();
    const revokedAt = new Date('2026-10-02T08:00:00Z');
    const revoked = { ...stored, revokedAt };
    for (const read of [
      tx.apiKey.findUnique,
      tx.apiKey.findFirst,
      prisma.apiKey.findUnique,
      prisma.apiKey.findFirst,
    ]) {
      read.mockResolvedValue(revoked);
    }

    const result = await service.revoke(actor, 'k1');

    expect(result).toMatchObject({
      id: 'k1',
      status: 'revoked',
      revokedAt: revokedAt.toISOString(),
    });
    expect(tx.apiKey.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('still deletes apikey:<hash> after commit when the key was already revoked', async () => {
    const { service, prisma, tx, audit, redis, events } = setup();
    const revoked = { ...stored, revokedAt: new Date('2026-10-02T08:00:00Z') };
    for (const read of [
      tx.apiKey.findUnique,
      tx.apiKey.findFirst,
      prisma.apiKey.findUnique,
      prisma.apiKey.findFirst,
    ]) {
      read.mockResolvedValue(revoked);
    }

    await service.revoke(actor, 'k1');

    // If Redis was down on the first revoke, this retry is what clears the cached record.
    expect(redis.del).toHaveBeenCalledOnce();
    expect(redis.del).toHaveBeenCalledWith(apiKeyCacheKey(stored.hash));
    expect(events).toEqual(['lock', 'commit', 'del']);
    expect(tx.apiKey.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('propagates a Redis failure after the commit: the revoke and its audit row were already written', async () => {
    const { service, tx, audit, redis, events } = setup();
    const down = new Error('Connection is closed.');
    redis.del.mockRejectedValueOnce(down);

    await expect(service.revoke(actor, 'k1')).rejects.toBe(down);

    // The row is revoked in the (mocked) database even though the caller gets the error.
    expect(tx.apiKey.update).toHaveBeenCalledOnce();
    expect(tx.apiKey.update.mock.calls[0]?.[0].data).toStrictEqual({
      revokedAt: expect.any(Date),
    });
    expect(audit.record).toHaveBeenCalledOnce();
    expect(events.slice(-2)).toEqual(['audit', 'commit']);
    expect(redis.del).toHaveBeenCalledOnce();
  });
});
