#!/bin/sh
set -e

: "${NAKAMA_NODE_NAME:=nakama1}"

# Prefer explicit NAKAMA_DATABASE_ADDRESS (e.g. external Postgres URL).
# Else Cloud Run + Cloud SQL: POSTGRES_* + CLOUDSQL_CONNECTION_NAME (Unix socket).
# Else local docker-compose default.
if [ -n "$NAKAMA_DATABASE_ADDRESS" ]; then
  :
elif [ -n "$CLOUDSQL_CONNECTION_NAME" ] && [ -n "$POSTGRES_PASSWORD" ]; then
  POSTGRES_USER="${POSTGRES_USER:-postgres}"
  POSTGRES_DB="${POSTGRES_DB:-nakama}"
  NAKAMA_DATABASE_ADDRESS="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@/${POSTGRES_DB}?host=/cloudsql/${CLOUDSQL_CONNECTION_NAME}&sslmode=disable"
else
  NAKAMA_DATABASE_ADDRESS="postgres:localdb@postgres:5432/nakama"
fi

/nakama/nakama migrate up --database.address "$NAKAMA_DATABASE_ADDRESS"
exec /nakama/nakama \
  --name "$NAKAMA_NODE_NAME" \
  --database.address "$NAKAMA_DATABASE_ADDRESS" \
  --config /nakama/data/local.yml
