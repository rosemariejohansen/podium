-- CreateEnum
CREATE TYPE "SortOrder" AS ENUM ('ASC', 'DESC');

-- CreateEnum
CREATE TYPE "KeyScope" AS ENUM ('SCORES_READ', 'SCORES_WRITE');

-- CreateEnum
CREATE TYPE "ReviewRule" AS ENUM ('BEATS_TOP_BY_MARGIN', 'RAPID_IMPROVEMENT');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('GAME_CREATED', 'GAME_UPDATED', 'GAME_DELETED', 'LEADERBOARD_CREATED', 'LEADERBOARD_UPDATED', 'LEADERBOARD_DELETED', 'LEADERBOARD_RESET', 'KEY_CREATED', 'KEY_REVOKED', 'SCORE_REMOVED', 'REVIEW_APPROVED', 'REVIEW_REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "githubId" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Leaderboard" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" "SortOrder" NOT NULL,
    "unit" TEXT,
    "minScore" BIGINT,
    "maxScore" BIGINT,
    "reviewMarginPct" INTEGER NOT NULL DEFAULT 25,
    "reviewMinEntries" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Leaderboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "scopes" "KeyScope"[],
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Score" (
    "id" TEXT NOT NULL,
    "leaderboardId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "value" BIGINT NOT NULL,
    "achievedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreReview" (
    "id" TEXT NOT NULL,
    "leaderboardId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "value" BIGINT NOT NULL,
    "ruleCode" "ReviewRule" NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ScoreReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "gameId" TEXT,
    "action" "AuditAction" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "ip" TEXT,
    "meta" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestStat" (
    "gameId" TEXT NOT NULL,
    "bucket" TIMESTAMP(3) NOT NULL,
    "route" TEXT NOT NULL,
    "statusClass" TEXT NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "RequestStat_pkey" PRIMARY KEY ("gameId","bucket","route","statusClass")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_githubId_key" ON "User"("githubId");

-- CreateIndex
CREATE UNIQUE INDEX "Game_slug_key" ON "Game"("slug");

-- CreateIndex
CREATE INDEX "Game_ownerId_idx" ON "Game"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Leaderboard_gameId_slug_key" ON "Leaderboard"("gameId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_hash_key" ON "ApiKey"("hash");

-- CreateIndex
CREATE INDEX "ApiKey_gameId_idx" ON "ApiKey"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_gameId_externalId_key" ON "Player"("gameId", "externalId");

-- CreateIndex
CREATE INDEX "Score_leaderboardId_value_achievedAt_idx" ON "Score"("leaderboardId", "value", "achievedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Score_leaderboardId_playerId_key" ON "Score"("leaderboardId", "playerId");

-- CreateIndex
CREATE INDEX "ScoreReview_leaderboardId_status_idx" ON "ScoreReview"("leaderboardId", "status");

-- CreateIndex
CREATE INDEX "AuditLog_gameId_createdAt_idx" ON "AuditLog"("gameId", "createdAt");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leaderboard" ADD CONSTRAINT "Leaderboard_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_leaderboardId_fkey" FOREIGN KEY ("leaderboardId") REFERENCES "Leaderboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreReview" ADD CONSTRAINT "ScoreReview_leaderboardId_fkey" FOREIGN KEY ("leaderboardId") REFERENCES "Leaderboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreReview" ADD CONSTRAINT "ScoreReview_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreReview" ADD CONSTRAINT "ScoreReview_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestStat" ADD CONSTRAINT "RequestStat_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
