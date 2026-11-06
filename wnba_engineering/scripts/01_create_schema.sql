-- 01 · schema
-- Run automatically by the Postgres container on first start (/docker-entrypoint-initdb.d),
-- or by hand on an existing database: psql "$WNBA_PG_URL" -f scripts/01_create_schema.sql

CREATE SCHEMA IF NOT EXISTS wnba;
