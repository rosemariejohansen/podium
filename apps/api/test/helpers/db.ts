import pg from 'pg';
import type { Redis } from 'ioredis';

const TABLES = [
  'RequestStat',
  'AuditLog',
  'ScoreReview',
  'Score',
  'Player',
  'ApiKey',
  'Leaderboard',
  'Game',
  'User',
];

/** Empties every table in the *test* database. Refuses to touch any database not ending in _test. */
export async function resetDatabase(): Promise<void> {
  const url = process.env.MIGRATE_DATABASE_URL;
  const appUrl = process.env.DATABASE_URL;
  if (!url) throw new Error('MIGRATE_DATABASE_URL is not set');
  if (!appUrl) throw new Error('DATABASE_URL is not set');
  const dbName = new URL(url).pathname;
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to reset non-test database ${dbName}`);
  }
  if (new URL(appUrl).pathname !== dbName) {
    throw new Error(
      `DATABASE_URL (${new URL(appUrl).pathname}) and MIGRATE_DATABASE_URL (${dbName}) point at different databases`,
    );
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(', ')} CASCADE`);
  } finally {
    await client.end();
  }
}

/** Flushes the Redis test database (never index 0, the dev database). */
export async function resetRedis(redis: Redis): Promise<void> {
  if (redis.options.db === 0) throw new Error('Refusing to flush Redis database 0');
  await redis.flushdb();
}
