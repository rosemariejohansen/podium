/*
  Warnings:

  - The primary key for the `RequestStat` table will be changed. If it partially fails, the table could be left without primary key constraint.

  PRD §7: timestamps are timestamptz in UTC. Every existing value was written as a
  UTC wall-clock time into a `timestamp` column, so each conversion states the zone
  explicitly (USING "x" AT TIME ZONE 'UTC') instead of relying on the session TimeZone.
*/
-- AlterTable
ALTER TABLE "ApiKey" ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMPTZ(3) USING "expiresAt" AT TIME ZONE 'UTC',
ALTER COLUMN "lastUsedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "lastUsedAt" AT TIME ZONE 'UTC',
ALTER COLUMN "revokedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "revokedAt" AT TIME ZONE 'UTC',
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "AuditLog" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "Game" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "Leaderboard" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "Player" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "RequestStat" DROP CONSTRAINT "RequestStat_pkey",
ALTER COLUMN "bucket" SET DATA TYPE TIMESTAMPTZ(3) USING "bucket" AT TIME ZONE 'UTC',
ADD CONSTRAINT "RequestStat_pkey" PRIMARY KEY ("gameId", "bucket", "route", "statusClass");

-- AlterTable
ALTER TABLE "Score" ALTER COLUMN "achievedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "achievedAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "ScoreReview" ALTER COLUMN "submittedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "submittedAt" AT TIME ZONE 'UTC',
ALTER COLUMN "decidedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "decidedAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';
