import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // The Prisma CLI always connects as the schema owner (mos_migrator, SEC-INF-4).
    // The running API connects as mos_app via DATABASE_URL. `prisma generate` never
    // connects, so the placeholder keeps it working where no env is set (CI lint jobs).
    url: process.env.MIGRATE_DATABASE_URL ?? 'postgresql://placeholder@localhost:5432/placeholder',
  },
});
