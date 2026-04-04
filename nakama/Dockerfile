# Compile TypeScript match runtime → single bundle for Nakama JS entrypoint.
# nakama-runtime is installed from a GitHub tarball (no git binary needed in the image).
FROM node:20-alpine AS runtime-build

WORKDIR /build

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

ENV NAKAMA_NODE_NAME=nakama1

ENTRYPOINT ["/nakama/docker-entrypoint.sh"]
