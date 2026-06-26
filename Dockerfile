# Imagem de produção para deploy no Coolify (ver docs/STACK.md §4).
# Next.js em modo standalone (next.config.ts: output: 'standalone').

# --- deps ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# --- build ---
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
# bundle autossuficiente do runner de migração (sem drizzle-kit no runtime)
RUN npm run build:migrate

# --- runtime ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV MIGRATIONS_DIR=./migrations
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs
COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
# migração: bundle + arquivos SQL + entrypoint
COPY --from=build --chown=nextjs:nodejs /app/.migrate/migrate.mjs ./migrate.mjs
COPY --from=build --chown=nextjs:nodejs /app/src/lib/db/migrations ./migrations
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENTRYPOINT ["./docker-entrypoint.sh"]
