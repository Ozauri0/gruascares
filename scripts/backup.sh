#!/bin/sh
# Respaldo de PostgreSQL y de las imágenes subidas, sin abrir puertos (todo pasa por `docker compose exec`).
#
#   scripts/backup.sh                      # guarda en ./backups y conserva 14 días
#   BACKUP_DIR=/srv/backups KEEP_DAYS=30 scripts/backup.sh
#
# Diario con cron (como el usuario que usa Docker):
#   0 3 * * * cd /ruta/gruascares && scripts/backup.sh >> backups/backup.log 2>&1
set -eu

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
COMPOSE="${COMPOSE:-docker compose -f docker-compose.yml -f docker-compose.prod.yml}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"
umask 077

# El superusuario del contenedor se lee de sus propias variables (POSTGRES_USER / POSTGRES_DB).
$COMPOSE exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$BACKUP_DIR/db-$STAMP.sql.gz"
$COMPOSE exec -T backend tar -C /data/uploads -czf - . > "$BACKUP_DIR/uploads-$STAMP.tar.gz"

# Un respaldo vacío o truncado es peor que ninguno: se verifica antes de rotar.
gzip -t "$BACKUP_DIR/db-$STAMP.sql.gz"
gzip -t "$BACKUP_DIR/uploads-$STAMP.tar.gz"

find "$BACKUP_DIR" -maxdepth 1 \( -name 'db-*.sql.gz' -o -name 'uploads-*.tar.gz' \) -mtime "+$KEEP_DAYS" -delete
echo "Respaldo $STAMP listo en $BACKUP_DIR"
