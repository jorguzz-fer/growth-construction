#!/bin/sh
# Entrypoint da imagem de produção: aplica as migrações (se DATABASE_URL estiver
# presente) e então sobe o servidor Next.js standalone.
set -e

if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] aplicando migrações do banco..."
  node migrate.mjs
else
  echo "[entrypoint] DATABASE_URL ausente — pulando migrações."
fi

exec node server.js
