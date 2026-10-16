# Guía de desarrollo local

Cómo levantar el sistema completo (frontend + backend + PostgreSQL), probarlo y verificar un cambio antes de abrir un PR.

## Requisitos

- [Bun](https://bun.sh) y Docker (para PostgreSQL). Nada más: no hace falta instalar Postgres en la máquina.

## Primer arranque

```bash
bun run setup:local        # Postgres, backend/.env, dependencias, migraciones y datos demo
bun run backend:dev        # terminal 1 → API en http://localhost:4000
bun run dev                # terminal 2 → sitio en http://localhost:3000
bun run smoke              # (opcional) recorrido de punta a punta con ambos arriba
```

`setup:local` es idempotente: puedes repetirlo cuando quieras. No modifica un `backend/.env` existente. Para **recrear la base desde cero** (borra los datos locales):

```bash
bun run setup:local -- --reset
```

> Si tu base se creó hace tiempo con `db:push` (el script ya no existe), las migraciones fallarán con "relation already exists": usa `--reset`.

## Cómo se conectan las piezas

```
Navegador ──► Next (3000) ──/api/*──► Express (4000) ──► PostgreSQL (5432)
              pantallas      proxy                       solo en 127.0.0.1
```

El navegador solo habla con `localhost:3000`; Next reenvía `/api/*` al backend (`BACKEND_URL`), así la cookie de sesión `httpOnly` es de primera parte y no hace falta CORS. Decisiones en `docs/DECISIONS.md` (ADR 007 a 010).

## Acceso demo (sin credenciales)

Con `DEMO_MODE=true` en `backend/.env`, los botones **Entrar como Cliente / Mecánico / Admin** de `/login` abren una sesión real sin pedir clave (`POST /api/auth/demo-login`). Cuentas sembradas por `db:seed` (solo desarrollo):

| Rol | Correo | Clave |
| :--- | :--- | :--- |
| Cliente | `cliente@demo.test` (también `cliente2@`) | `cliente1234` |
| Mecánico | `mecanico@demo.test` (también `mecanico2@`) | `mecanico1234` |
| Admin | `admin@demo.test` | `admin1234` |

El formulario de `/login` y `/registro` funcionan con credenciales reales. **Antes de producción** hay que retirar el modo demo (issue #47): el servidor se niega a arrancar con `NODE_ENV=production` y `DEMO_MODE=true`.

## Variables de entorno

Backend (`backend/.env`, plantilla en `backend/.env.example`):

| Variable | Para qué | Notas |
| :--- | :--- | :--- |
| `NODE_ENV` | Modo | Si se omite se asume `production` (estricto). Local: `development`. |
| `DATABASE_URL` | PostgreSQL | |
| `JWT_SECRET` | Firma de sesiones | Obligatorio y ≥ 32 caracteres en producción. En desarrollo, si falta se usa uno temporal. |
| `CORS_ORIGIN` | Orígenes permitidos | Lista separada por comas; en desarrollo también se acepta `localhost`. |
| `DEMO_MODE` | Login demo | Nunca en producción. |
| `APP_URL` | URL pública del sitio | Enlaces de los correos (recuperación de contraseña). |
| `SMTP_*`, `EMAIL_FROM` | Correo | Sin `SMTP_HOST/USER/PASS` los correos se **simulan** y se muestran en la consola del backend. |
| `TRUST_PROXY` | Proxies de confianza | Para `req.ip` y límites de tasa detrás de nginx. |
| `BCRYPT_ROUNDS` | Costo de contraseñas | 12 por defecto. |
| `UPLOADS_DIR` | Imágenes subidas por el admin (editor de la página y catálogo) | Por defecto `backend/uploads` (ignorada por git). En producción debe ser una carpeta persistente. Con Docker (`docker compose --profile app up -d --build`) es el volumen `uploads_data`, montado en `/data/uploads`. |

Frontend (`.env`, plantilla en `.env.example`): `BACKEND_URL` (por defecto `http://localhost:4000`).

## Pruebas y verificación

```bash
bun run backend:test        # pruebas del backend (usa la BD aislada gruas_cares_test, que recrea en cada ejecución)
bun run backend:typecheck   # tipos del backend
bun run test                # pruebas del frontend (cliente HTTP, adaptadores, protección de rutas)
bun run test:types          # tipos de las pruebas del frontend y de scripts/
bun run smoke               # de punta a punta contra el sistema en marcha
bun run build               # build del frontend
bun run backend:build       # build del backend
```

Antes de abrir un PR deben pasar **todas**. Las pruebas del backend necesitan el Postgres de `docker compose up -d`; si no está disponible, las que usan base se omiten con una advertencia (no cuentan como verificación).

`bun run smoke` recorre, por el puerto 3000 y con los tres roles: sesión demo → agendar con vehículo → el mecánico confirma, inicia y entrega el informe → el cliente lo ve en su historial → el admin ve métricas y descarga el respaldo → permisos cruzados y cierre de sesión. Deja una cita de prueba en tu base local.

## Base de datos y migraciones

El esquema vive en `backend/src/db/schema.ts` y los cambios se versionan en `backend/drizzle/`:

1. Edita `schema.ts`.
2. `bun run db:generate` (revisa y commitea el `.sql` generado).
3. `bun run db:migrate` aplica las pendientes.

No se usa `db:push`. `bun run db:seed` solo funciona fuera de producción y es idempotente.

## Problemas frecuentes

| Síntoma | Causa y solución |
| :--- | :--- |
| El login devuelve 500 | La base local no tiene las migraciones nuevas → `bun run setup:local -- --reset`. |
| "El acceso demo no está habilitado" | Falta `DEMO_MODE=true` en `backend/.env` (reinicia el backend). |
| "Los usuarios demo no están disponibles" | Falta `bun run db:seed`. |
| Las pantallas redirigen siempre a `/login` | El backend no está arriba o `BACKEND_URL` apunta a otro puerto: el proxy no puede verificar la sesión y falla cerrado. |
| Un cambio del admin tarda en verse en `/catalogo` | La lectura pública está en caché 30 s. |
| Puerto 5432 ocupado | Otro Postgres local; detenlo o cambia el puerto en `docker-compose.yml` y en `DATABASE_URL`. |
