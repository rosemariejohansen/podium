import { describe, expect, it } from 'vitest';
import { toBigIntOrNull, toLeaderboardDto } from './leaderboards.mapper.js';

describe('leaderboards mapper', () => {
  it('turns BIGINT bounds into JSON numbers', () => {
    const dto = toLeaderboardDto({
      id: 'b1',
      gameId: 'g1',
      slug: 'fastest',
      name: 'Fastest',
      sortOrder: 'ASC',
      unit: 'ms',
      minScore: 0n,
      maxScore: 600000n,
      reviewMarginPct: 25,
      reviewMinEntries: 10,
      createdAt: new Date('2026-10-03T00:00:00Z'),
    });
    expect(dto).toMatchObject({
      minScore: 0,
      maxScore: 600000,
      createdAt: '2026-10-03T00:00:00.000Z',
    });
  });
  it('keeps undefined (no change) distinct from null (clear)', () => {
    expect(toBigIntOrNull(undefined)).toBeUndefined();
    expect(toBigIntOrNull(null)).toBeNull();
    expect(toBigIntOrNull(-5)).toBe(-5n);
  });
});
