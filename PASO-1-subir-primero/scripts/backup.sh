#!/usr/bin/env bash
# Respaldo completo: base de datos (formato custom de pg_dump) + documentos locales.
# Uso:  DATABASE_URL=... ./scripts/backup.sh  [carpeta_destino]
set -euo pipefail
DEST="${1:-./backups}"; STAMP="$(date +%Y-%m-%d_%H%M)"
mkdir -p "$DEST"
pg_dump --format=custom --no-owner --file="$DEST/club_campestre_$STAMP.dump" "$DATABASE_URL"
if [ "${STORAGE_DRIVER:-local}" = "local" ] && [ -d "${STORAGE_LOCAL_DIR:-./storage}" ]; then
  tar -czf "$DEST/documentos_$STAMP.tar.gz" -C "${STORAGE_LOCAL_DIR:-./storage}" .
fi
# conservar los últimos 30 respaldos
ls -1t "$DEST"/club_campestre_*.dump 2>/dev/null | tail -n +31 | xargs -r rm --
ls -1t "$DEST"/documentos_*.tar.gz 2>/dev/null | tail -n +31 | xargs -r rm --
echo "Respaldo generado en $DEST ($STAMP)"
