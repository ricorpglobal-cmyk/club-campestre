#!/usr/bin/env bash
# Restaura un respaldo en una base de datos VACÍA (nunca sobre la de producción en uso).
# Uso:  DATABASE_URL=postgres://.../club_campestre_restaurada ./scripts/restore.sh backups/club_campestre_AAAA-MM-DD_HHMM.dump [documentos.tar.gz]
set -euo pipefail
DUMP="$1"
pg_restore --no-owner --exit-on-error --dbname="$DATABASE_URL" "$DUMP"
if [ -n "${2:-}" ]; then mkdir -p "${STORAGE_LOCAL_DIR:-./storage}"; tar -xzf "$2" -C "${STORAGE_LOCAL_DIR:-./storage}"; fi
echo "Restauración terminada. Verifique con: npm run db:migrate (debe indicar 'Migraciones al día')."
