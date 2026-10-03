#!/bin/sh
# Runs once, when the container starts with an empty data directory.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v migrator_password="$MOS_MIGRATOR_PASSWORD" \
  -v app_password="$MOS_APP_PASSWORD" \
  -f /mos-sql/roles.sql
