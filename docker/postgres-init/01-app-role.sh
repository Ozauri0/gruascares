#!/bin/sh
# Se ejecuta solo al inicializar un volumen nuevo de Postgres (docker-entrypoint-initdb.d).
# Crea el usuario de la aplicación (sin privilegios de superusuario) y lo deja como dueño de la base,
# de modo que el backend y las migraciones funcionan sin usar "postgres".
set -eu
: "${APP_DB_USER:?Define APP_DB_USER}"
: "${APP_DB_PASSWORD:?Define APP_DB_PASSWORD}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_user="$APP_DB_USER" -v app_password="$APP_DB_PASSWORD" -v db_name="$POSTGRES_DB" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE', :'app_user', :'app_password') \gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'db_name', :'app_user') \gexec
SELECT format('ALTER SCHEMA public OWNER TO %I', :'app_user') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'db_name') \gexec
SQL
