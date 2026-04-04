# Compile TypeScript match runtime → single bundle for Nakama JS entrypoint.
FROM node:20-bookworm-slim AS runtime-build

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY runtime/package.json runtime/package-lock.json ./
RUN npm ci

COPY runtime/tsconfig.json ./
COPY runtime/src ./src
RUN npm run build

# Official Nakama image with baked modules (no bind-mount required).
FROM heroiclabs/nakama:3.38.0

COPY --from=runtime-build /build/build /nakama/data/modules/build
COPY local.yml /nakama/data/local.yml
COPY docker-entrypoint.sh /nakama/docker-entrypoint.sh

RUN chmod +x /nakama/docker-entrypoint.sh

EXPOSE 7350 7351

ENV NAKAMA_DATABASE_ADDRESS=postgres:localdb@postgres:5432/nakama
ENV NAKAMA_NODE_NAME=nakama1

ENTRYPOINT ["/nakama/docker-entrypoint.sh"]
