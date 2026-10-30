# syntax=docker/dockerfile:1.7
# AND (ANAF for Dummies) — imagine de producție (Next.js 16, SQLite/libSQL)

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:24-bookworm-slim AS run
WORKDIR /app
# TZ: datele „de azi” (emitere, scadență) și orele afișate trebuie să fie în ora României, nu UTC.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TZ=Europe/Bucharest \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/app/data/anaf-for-dummies.db
RUN groupadd -g 1001 app && useradd -u 1001 -g app -m app \
 && mkdir -p /app/data && chown app:app /app/data
COPY --from=build --chown=app:app /app/package.json /app/next.config.ts /app/tsconfig.json ./
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/.next ./.next
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/drizzle ./drizzle
COPY --from=build --chown=app:app /app/src ./src
COPY --from=build --chown=app:app /app/scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
USER app
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["sh", "./scripts/docker-entrypoint.sh"]
