#!/bin/sh
set -e

: "${NAKAMA_DATABASE_ADDRESS:=postgres:localdb@postgres:5432/nakama}"
: "${NAKAMA_NODE_NAME:=nakama1}"

/nakama/nakama migrate up --database.address "$NAKAMA_DATABASE_ADDRESS"
exec /nakama/nakama \
  --name "$NAKAMA_NODE_NAME" \
  --database.address "$NAKAMA_DATABASE_ADDRESS" \
  --config /nakama/data/local.yml
