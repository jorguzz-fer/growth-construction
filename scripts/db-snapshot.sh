#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Snapshot do banco ANTES de qualquer alteração estrutural (Fase 1).
#
# Requisito bloqueante do projeto: nenhuma migração/correção pode ser aplicada
# sem um backup verificado e restaurável. Este script gera o dump, confere que
# o arquivo não está vazio e (opcionalmente) TESTA a restauração num banco
# descartável — provando que o rollback é possível de verdade.
#
# Uso:
#   ./scripts/db-snapshot.sh                      # só o dump
#   ./scripts/db-snapshot.sh --verify-restore     # dump + teste de restauração
#
# Requer DATABASE_URL. Nunca escreve no banco de origem.
# ---------------------------------------------------------------------------
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERRO: DATABASE_URL não definida." >&2
  exit 1
fi

STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_DIR="${BACKUP_DIR:-./backups}"
OUT="${OUT_DIR}/growth_${STAMP}.dump"
mkdir -p "$OUT_DIR"

echo "==> Gerando snapshot: $OUT"
# Formato custom (-Fc): permite restauração seletiva por tabela via pg_restore.
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$OUT"

SIZE=$(stat -c%s "$OUT" 2>/dev/null || stat -f%z "$OUT")
if [ "$SIZE" -lt 1024 ]; then
  echo "ERRO: dump suspeito (${SIZE} bytes). Backup NÃO confiável — abortando." >&2
  exit 1
fi
echo "==> Snapshot OK (${SIZE} bytes)"

echo "==> Inventário de registros no momento do snapshot:"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$(dirname "$0")/integridade.sql" \
  | tee "${OUT_DIR}/growth_${STAMP}_inventario.txt"

if [ "${1:-}" = "--verify-restore" ]; then
  TMPDB="growth_restore_test_${STAMP}"
  echo "==> Testando restauração em banco descartável: $TMPDB"
  BASE_URL="${DATABASE_URL%/*}"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${TMPDB};"
  pg_restore --dbname="${BASE_URL}/${TMPDB}" --no-owner --no-privileges "$OUT"
  echo "==> Inventário do banco RESTAURADO (deve bater com o de origem):"
  psql "${BASE_URL}/${TMPDB}" -v ON_ERROR_STOP=1 -f "$(dirname "$0")/integridade.sql"
  echo "==> Para descartar: psql \"\$DATABASE_URL\" -c 'DROP DATABASE ${TMPDB};'"
fi

echo "==> Concluído. Guarde $OUT antes de aplicar qualquer migração."
