-- Applied inside each database; :dbname is set by roles.sql.
REVOKE ALL ON DATABASE :"dbname" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"dbname" TO mos_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO mos_app;
-- Tables and sequences that mos_migrator creates later (Prisma migrations) become usable by mos_app.
ALTER DEFAULT PRIVILEGES FOR ROLE mos_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mos_app;
ALTER DEFAULT PRIVILEGES FOR ROLE mos_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO mos_app;
