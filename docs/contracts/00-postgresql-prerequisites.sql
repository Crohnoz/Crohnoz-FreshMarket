-- Run before postgresql-schema.sql in a disposable development database.
-- Contract-only; production must manage extensions through reviewed migrations.

create extension if not exists pgcrypto;
create extension if not exists citext;
