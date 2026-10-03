-- Creates the application roles and databases (PRD SEC-INF-4).
-- Run as a superuser: psql -v migrator_password=... -v app_password=... -f roles.sql
CREATE ROLE mos_migrator LOGIN CREATEDB PASSWORD :'migrator_password';
CREATE ROLE mos_app LOGIN PASSWORD :'app_password';
CREATE DATABASE mos OWNER mos_migrator;
CREATE DATABASE mos_test OWNER mos_migrator;

\set dbname mos
\connect :dbname
\ir grants.sql

\set dbname mos_test
\connect :dbname
\ir grants.sql
