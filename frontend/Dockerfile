# Build Vite app (Nakama URLs are baked at build time — override ARGs for your deploy).
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
# `npm ci` can fail when the lock was produced on another OS/npm (optional deps); install is OK for image builds.
RUN npm install --no-audit --no-fund

COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json eslint.config.js ./
COPY public ./public
COPY src ./src

ARG VITE_NAKAMA_HOST=127.0.0.1
ARG VITE_NAKAMA_PORT=7350
ARG VITE_NAKAMA_SERVER_KEY=defaultkey
ARG VITE_NAKAMA_USE_SSL=false

ENV VITE_NAKAMA_HOST=$VITE_NAKAMA_HOST
ENV VITE_NAKAMA_PORT=$VITE_NAKAMA_PORT
ENV VITE_NAKAMA_SERVER_KEY=$VITE_NAKAMA_SERVER_KEY
ENV VITE_NAKAMA_USE_SSL=$VITE_NAKAMA_USE_SSL

RUN npm run build

# Static hosting
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
