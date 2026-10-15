#!/usr/bin/env bash
# Prepara el entorno local: Postgres (docker), variables de entorno, dependencias, migraciones y datos demo.
#
#   bun run setup:local            # primera vez o para actualizar (no toca un .env existente)
#   bun run setup:local -- --reset # además recrea la base de datos desde cero (BORRA los datos locales)
set -euo pipefail
cd "$(dirname "$0")/.."

RESET=0
for arg in "$@"; do [ "$arg" = "--reset" ] && RESET=1; done

need() { command -v "$1" >/dev/null 2>&1 || { echo "❌ Falta '$1'. Instálalo y vuelve a ejecutar."; exit 1; }; }
need docker
need bun

if [ "$RESET" = "1" ]; then
  echo "🗑  Recreando la base de datos local (--reset)…"
  docker compose down -v
fi

echo "🐘 Levantando PostgreSQL…"
docker compose up -d postgres
printf "⏳ Esperando a que la base acepte conexiones"
for _ in $(seq 1 40); do
  if docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; then echo " ✔"; break; fi
  printf "."; sleep 1
done
docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1 || { echo; echo "❌ PostgreSQL no respondió a tiempo."; exit 1; }

if [ ! -f backend/.env ]; then
  echo "📝 Creando backend/.env (desarrollo, modo demo, correos simulados)…"
  SECRET=$(openssl rand -base64 48 2>/dev/null || head -c 48 /dev/urandom | base64)
  sed -e 's|^NODE_ENV=.*|NODE_ENV=development|' \
      -e "s|^JWT_SECRET=.*|JWT_SECRET=${SECRET}|" \
      -e 's|^DEMO_MODE=.*|DEMO_MODE=true|' \
      -e 's|^SMTP_HOST=.*|SMTP_HOST=|' -e 's|^SMTP_USER=.*|SMTP_USER=|' -e 's|^SMTP_PASS=.*|SMTP_PASS=|' \
      backend/.env.example > backend/.env
else
  echo "ℹ️  backend/.env ya existe: no se modifica (revisa que tenga DEMO_MODE=true para el acceso demo)."
fi
[ -f .env ] || { echo "📝 Creando .env del frontend…"; cp .env.example .env; }

echo "📦 Instalando dependencias…"
bun install
(cd backend && bun install)

echo "🧱 Aplicando migraciones…"
if ! bun run db:migrate; then
  echo
  echo "❌ Las migraciones fallaron. Si tu base se creó antes con 'db:push' (tablas ya existentes),"
  echo "   recréala con:  bun run setup:local -- --reset"
  exit 1
fi

echo "🌱 Cargando datos demo…"
bun run db:seed

cat <<'MSG'

✅ Entorno listo. En dos terminales:

   bun run backend:dev      # API en http://localhost:4000
   bun run dev              # sitio en http://localhost:3000

   Con ambos arriba:        bun run smoke      # prueba de punta a punta

Acceso demo (sin credenciales): botones "Entrar como…" en /login.
Cuentas sembradas: cliente@ / mecanico@ / admin@demo.test (claves en docs/DEVELOPMENT.md).
MSG
