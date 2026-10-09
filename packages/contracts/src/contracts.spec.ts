import { describe, expect, it } from 'vitest';
import {
  apiKeyCreateSchema,
  ERROR_CODES,
  ERROR_HTTP_STATUS,
  gameCreateSchema,
  gameUpdateSchema,
  leaderboardCreateSchema,
  leaderboardUpdateSchema,
  safeIntegerSchema,
  slugSchema,
  userSyncSchema,
} from './index.js';

describe('slugSchema', () => {
  it.each(['abc', 'asteroids', 'a-1', 'x'.repeat(40), 'fastest-reaction'])('accepts %s', (s) => {
    expect(slugSchema.safeParse(s).success).toBe(true);
  });
  it.each(['ab', '-abc', 'abc-', 'ABC', 'a_b', 'a b', 'x'.repeat(41), ''])('rejects "%s"', (s) => {
    expect(slugSchema.safeParse(s).success).toBe(false);
  });
});

describe('gameCreateSchema', () => {
  it('trims names', () => {
    const parsed = gameCreateSchema.parse({ name: '  Asteroids  ', slug: 'asteroids' });
    expect(parsed.name).toBe('Asteroids');
  });
  it('rejects whitespace-only name', () => {
    expect(gameCreateSchema.safeParse({ name: '   ', slug: 'asteroids' }).success).toBe(false);
  });
  it('rejects names over 60 chars', () => {
    expect(gameCreateSchema.safeParse({ name: 'n'.repeat(61), slug: 'asteroids' }).success).toBe(
      false,
    );
  });
  it.each(['demo', 'api', 'admin', 'dashboard', 'docs', 'new', 'settings'])(
    'rejects reserved slug %s',
    (slug) => {
      const result = gameCreateSchema.safeParse({ name: 'X', slug });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['slug']);
    },
  );
  it('rejects unknown keys', () => {
    expect(gameCreateSchema.safeParse({ name: 'X', slug: 'abc', ownerId: 'u1' }).success).toBe(
      false,
    );
  });
  describe('description', () => {
    const base = { name: 'X', slug: 'abc' };
    it.each(['', '   ', '\t\n '])('turns the blank description %j into null', (description) => {
      expect(gameCreateSchema.parse({ ...base, description }).description).toBeNull();
    });
    it('trims surrounding whitespace', () => {
      expect(gameCreateSchema.parse({ ...base, description: 'abc ' }).description).toBe('abc');
    });
    it('accepts exactly 280 characters', () => {
      const description = 'd'.repeat(280);
      expect(gameCreateSchema.parse({ ...base, description }).description).toBe(description);
    });
    it('rejects 281 characters on the description path', () => {
      const r = gameCreateSchema.safeParse({ ...base, description: 'd'.repeat(281) });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0]?.path).toEqual(['description']);
    });
    it('accepts its own output: a null description parses again (web parse → API parse)', () => {
      const once = gameCreateSchema.parse({ ...base, description: '   ' });
      expect(gameCreateSchema.parse(once).description).toBeNull();
    });
    it('leaves an omitted description undefined', () => {
      expect(gameCreateSchema.parse(base).description).toBeUndefined();
    });
  });
});

describe('gameUpdateSchema', () => {
  it('rejects an empty update', () => {
    expect(gameUpdateSchema.safeParse({}).success).toBe(false);
  });
  it('rejects slug changes (FR-GAME-4)', () => {
    expect(gameUpdateSchema.safeParse({ slug: 'other' }).success).toBe(false);
  });
  describe('description', () => {
    it('allows clearing the description', () => {
      expect(gameUpdateSchema.parse({ description: null })).toEqual({ description: null });
    });
    it.each(['', '   ', '\t\n '])('turns the blank description %j into null', (description) => {
      expect(gameUpdateSchema.parse({ description })).toEqual({ description: null });
    });
    it('trims surrounding whitespace', () => {
      expect(gameUpdateSchema.parse({ description: 'abc ' })).toEqual({ description: 'abc' });
    });
    it('rejects 281 characters on the description path', () => {
      const r = gameUpdateSchema.safeParse({ description: 'd'.repeat(281) });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0]?.path).toEqual(['description']);
    });
    it('leaves an omitted description undefined', () => {
      const parsed = gameUpdateSchema.parse({ name: 'New name' });
      expect(parsed.description).toBeUndefined();
      expect('description' in parsed).toBe(false);
    });
  });
});

describe('safeIntegerSchema', () => {
  it('accepts the safe range bounds', () => {
    expect(safeIntegerSchema.parse(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    expect(safeIntegerSchema.parse(-Number.MAX_SAFE_INTEGER)).toBe(-Number.MAX_SAFE_INTEGER);
  });
  it.each([2 ** 53, 1.5, Number.NaN, '5'])('rejects %s', (v) => {
    expect(safeIntegerSchema.safeParse(v).success).toBe(false);
  });
});

describe('leaderboardCreateSchema', () => {
  const base = { name: 'Fastest', slug: 'fastest-reaction', sortOrder: 'ASC' as const };
  it('applies review defaults', () => {
    expect(leaderboardCreateSchema.parse(base)).toMatchObject({
      reviewMarginPct: 25,
      reviewMinEntries: 10,
    });
  });
  it('rejects minScore > maxScore on the maxScore path', () => {
    const r = leaderboardCreateSchema.safeParse({ ...base, minScore: 10, maxScore: 5 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['maxScore']);
  });
  it('rejects an unknown sort order', () => {
    expect(leaderboardCreateSchema.safeParse({ ...base, sortOrder: 'UP' }).success).toBe(false);
  });
  it('rejects unit longer than 10 chars', () => {
    expect(leaderboardCreateSchema.safeParse({ ...base, unit: 'milliseconds' }).success).toBe(
      false,
    );
  });
});

describe('leaderboardUpdateSchema', () => {
  it.each([{ slug: 'x-y-z' }, { sortOrder: 'DESC' }])(
    'rejects immutable field %o (FR-LB-2)',
    (patch) => {
      expect(leaderboardUpdateSchema.safeParse(patch).success).toBe(false);
    },
  );
  it('rejects an empty update', () => {
    expect(leaderboardUpdateSchema.safeParse({}).success).toBe(false);
  });
  it('allows clearing bounds', () => {
    expect(leaderboardUpdateSchema.parse({ minScore: null, maxScore: null })).toEqual({
      minScore: null,
      maxScore: null,
    });
  });
  it('rejects min > max when both are given', () => {
    expect(leaderboardUpdateSchema.safeParse({ minScore: 9, maxScore: 1 }).success).toBe(false);
  });
});

describe('apiKeyCreateSchema', () => {
  it('accepts both scopes and no expiry', () => {
    expect(
      apiKeyCreateSchema.parse({
        name: 'prod',
        scopes: ['scores:read', 'scores:write'],
        expiresInDays: null,
      }),
    ).toEqual({ name: 'prod', scopes: ['scores:read', 'scores:write'], expiresInDays: null });
  });
  it.each([
    { name: 'prod', scopes: [], expiresInDays: null },
    { name: 'prod', scopes: ['scores:read', 'scores:read'], expiresInDays: null },
    { name: 'prod', scopes: ['admin'], expiresInDays: null },
    { name: 'prod', scopes: ['scores:read'], expiresInDays: 7 },
    { name: '', scopes: ['scores:read'], expiresInDays: 30 },
    { name: 'n'.repeat(41), scopes: ['scores:read'], expiresInDays: 30 },
  ])('rejects %o', (input) => {
    expect(apiKeyCreateSchema.safeParse(input).success).toBe(false);
  });
});

describe('userSyncSchema', () => {
  it('accepts a null avatar', () => {
    expect(
      userSyncSchema.parse({ githubId: '42', login: 'neo', avatarUrl: null }).avatarUrl,
    ).toBeNull();
  });
  it.each(['javascript:alert(1)', 'data:text/html,x', 'http://avatars.githubusercontent.com/u/1'])(
    'rejects non-https avatar %s',
    (avatarUrl) => {
      expect(userSyncSchema.safeParse({ githubId: '42', login: 'neo', avatarUrl }).success).toBe(
        false,
      );
    },
  );
  it('accepts an https avatar', () => {
    const avatarUrl = 'https://avatars.githubusercontent.com/u/1?v=4';
    expect(userSyncSchema.safeParse({ githubId: '42', login: 'neo', avatarUrl }).success).toBe(
      true,
    );
  });
  it('rejects a non-URL avatar', () => {
    expect(
      userSyncSchema.safeParse({ githubId: '42', login: 'neo', avatarUrl: 'nope' }).success,
    ).toBe(false);
  });
});

describe('errors', () => {
  it('lists exactly the PRD §9.3 codes, each with a status', () => {
    expect(ERROR_CODES).toHaveLength(19);
    for (const code of ERROR_CODES) expect(ERROR_HTTP_STATUS[code]).toBeGreaterThanOrEqual(400);
    expect(ERROR_HTTP_STATUS.NOT_FOUND).toBe(404);
    expect(ERROR_HTTP_STATUS.CONFIRMATION_MISMATCH).toBe(422);
    expect(ERROR_HTTP_STATUS.IP_BLOCKED).toBe(429);
  });
});
