import './helpers/tokens.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './helpers/app.js';
import { resetDatabase } from './helpers/db.js';

// @prisma/adapter-pg writes a Date as an offset-less UTC wall-clock string, so every timestamptz
// read and write is only correct while the Postgres session TimeZone is UTC. These tests fail if
// PrismaService stops pinning it and the database default is not UTC.
describe('Postgres session time zone (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDatabase();
  });

  it('runs the app connection in UTC', async () => {
    const rows = await prisma.$queryRaw<{ TimeZone: string }[]>`SHOW TIME ZONE`;
    expect(rows).toEqual([{ TimeZone: 'UTC' }]);
  });

  // One summer and one winter instant, so a DST-dependent offset cannot pass by luck.
  it.each([
    ['2026-10-09T12:34:56.789Z', '2026-10-09 12:34:56.789'],
    ['2027-01-15T23:59:59.001Z', '2027-01-15 23:59:59.001'],
  ])(
    'round-trips the instant %s through a timestamptz column unshifted',
    async (iso, wallClock) => {
      const instant = new Date(iso);
      const created = await prisma.user.create({
        data: { githubId: 'gh-tz', login: 'tz', avatarUrl: null },
      });

      await prisma.user.update({ where: { id: created.id }, data: { createdAt: instant } });

      const read = await prisma.user.findUniqueOrThrow({ where: { id: created.id } });
      expect(read.createdAt.toISOString()).toBe(iso);

      // Cast to text so the driver does not reinterpret the value: this is what Postgres stored,
      // as a UTC wall clock.
      const raw = await prisma.$queryRaw<{ utc: string }[]>`
      SELECT ("createdAt" AT TIME ZONE 'UTC')::text AS utc FROM "User" WHERE id = ${created.id}`;
      expect(raw).toEqual([{ utc: wallClock }]);
    },
  );
});
