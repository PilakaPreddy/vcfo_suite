#!/bin/bash
# Resets the PRIVATE local copy for a clean acceptance run: empty database with all migrations and
# only the super admin, empty local file storage, no earlier results. Refuses any non-local database.
set -euo pipefail
cd "$(dirname "$0")/../../.."
set -a; . ./.env.local; set +a
case "$DATABASE_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "refusing: DATABASE_URL is not local"; exit 1;; esac
su postgres -c "psql -q -c 'drop database if exists vcfo with (force);' -c 'create database vcfo owner vcfo;'"
psql "$DATABASE_URL" -q -c 'create extension if not exists vector;'
npm run -s db:migrate >/dev/null
npm run -s db:seed >/dev/null
psql "$DATABASE_URL" -q -c "delete from profiles where email <> 'super@vcfo.local'"
pkill -f "s3mock/run.cjs" || true
rm -rf /opt/s3mock/data && mkdir -p /opt/s3mock/data
(cd /opt/s3mock && nohup node run.cjs > /opt/s3mock/log.txt 2>&1 &)
rm -rf e2e/uat/results e2e/uat/.auth
echo "reset done: $(psql "$DATABASE_URL" -tAc 'select count(*) from drizzle.__drizzle_migrations') migrations, $(psql "$DATABASE_URL" -tAc 'select count(*) from profiles') profile"
