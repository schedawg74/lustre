# Build from the repository root: docker build -f src/apps/server/Dockerfile .
FROM node:24.22.2-slim AS build
RUN npm install -g pnpm@12.15.0
WORKDIR /app
COPY . .
ENV HUSKY=0
RUN pnpm install --frozen-lockfile --filter @lustre/server...
RUN pnpm --filter @lustre/server build
RUN pnpm --filter @lustre/server deploy --legacy --prod /runtime

FROM node:24.22.2-slim
ENV NODE_ENV=production \
    DATABASE_PATH=/data/lustre.db \
    MIGRATIONS_FOLDER=/app/migrations \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /runtime/ ./
# The server applies these migrations at startup.
COPY --from=build --chown=node:node /app/src/packages/db/migrations ./migrations
RUN install -d -o node -g node /data
VOLUME /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/index.mjs"]
