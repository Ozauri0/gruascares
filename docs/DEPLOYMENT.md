# Despliegue en producción

Lista de verificación para publicar Grúas Cares. Complementa `docs/DEVELOPMENT.md` (variables) y `docs/ARCHITECTURE.md`.

## 1. Proxy y dirección IP real (`TRUST_PROXY`)

El navegador habla con Next (`/api/*` se reenvía al backend) y normalmente también pasa por nginx. Si `TRUST_PROXY` no se define, Express ignora `X-Forwarded-For` y **`req.ip` es la IP del proxy para todas las personas**:

- Los límites de tasa pasan a ser globales: p. ej. 10 registros por hora para todo el sitio, o un atacante que falla contraseñas bloquea el login de todos.
- El registro de actividad guarda la IP del proxy, no la del cliente.

Al revés, `TRUST_PROXY=true` confía en cualquier cabecera y permite **evadir** los límites cambiando `X-Forwarded-For`.

**Qué hacer**

1. Contar los saltos de confianza entre el cliente y el backend (p. ej. nginx → Next → backend = `2`).
2. Definir `TRUST_PROXY=<número de saltos>` en `backend/.env` (o la lista de IPs/subredes de los proxies).
3. nginx debe agregar la cabecera: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` y Next la reenvía al backend.
4. Verificar: hacer una petición desde un equipo conocido y comprobar en `/admin/registro` que la IP sea la real.

El backend avisa al arrancar en producción si `TRUST_PROXY` falta o vale `true`.

## 2. PostgreSQL: contraseñas y usuario sin superusuario

Para desarrollo, `docker-compose.yml` usa `postgrespassword`. **No usar fuera de local.** En producción:

```bash
export POSTGRES_PASSWORD="$(openssl rand -base64 32)"   # solo para administrar (superusuario "postgres")
export APP_DB_PASSWORD="$(openssl rand -base64 32)"     # usuario "gruas_app" que usa la aplicación
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile app up -d --build
```

- `docker-compose.prod.yml` **falla** si falta `POSTGRES_PASSWORD` o `APP_DB_PASSWORD`.
- El script `docker/postgres-init/01-app-role.sh` crea el usuario `gruas_app` (sin superusuario, sin crear bases ni roles), lo deja como dueño de la base `gruas_cares` y quita el acceso público. El backend y las migraciones usan ese usuario; nunca `postgres`.
- Guarda las contraseñas fuera del repositorio (gestor de secretos o `.env` del servidor con permisos `600`). No publiques el puerto 5432 fuera de la máquina; si la base está en otro host, usa TLS (`?sslmode=require`).

**Importante:** los scripts de `initdb.d` solo corren al crear el volumen. En una base **ya existente**:

```sql
-- conectado como postgres
CREATE ROLE gruas_app LOGIN PASSWORD '<APP_DB_PASSWORD>' NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER DATABASE gruas_cares OWNER TO gruas_app;
ALTER SCHEMA public OWNER TO gruas_app;
REASSIGN OWNED BY postgres TO gruas_app; -- tablas y tipos existentes (ejecutar dentro de gruas_cares)
ALTER USER postgres PASSWORD '<nueva POSTGRES_PASSWORD>';
```

y actualiza `DATABASE_URL`. Cambiar `POSTGRES_PASSWORD` en el compose **no** cambia la contraseña de una base ya inicializada.

## 3. Límites de tasa con varias instancias (Redis)

Con una sola instancia los límites en memoria bastan. Si escalas, usas varias instancias o no quieres que un reinicio los borre, define `REDIS_URL`:

```bash
export REDIS_PASSWORD="$(openssl rand -base64 32)"
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile redis --profile app up -d
# backend/.env → REDIS_URL=redis://:<REDIS_PASSWORD>@redis:6379
```

- Los contadores se guardan en Redis (prefijo `gc:rl:`): el límite es total entre instancias y sobrevive a reinicios.
- Si Redis no responde, **login, registro y recuperación de contraseña rechazan la petición con 429** (prioriza seguridad) y el resto de los límites deja pasar (el sitio sigue funcionando).
- Redis no publica puertos fuera de la máquina y no persiste datos (los contadores son efímeros).
- Prueba contra un Redis real: `REDIS_URL_TEST=redis://:<clave>@127.0.0.1:6379 bun test backend/tests/rate-limit-redis.test.ts`.

## 4. Otras variables obligatorias

`NODE_ENV=production`, `DEMO_MODE=false`, `JWT_SECRET` (≥ 32 caracteres), `CORS_ORIGIN`, `APP_URL` (URL pública: arma los enlaces de los correos), `SMTP_*` y `EMAIL_FROM` (sin SMTP nadie puede confirmar su correo), `UPLOADS_DIR` persistente.

## 5. Limpieza automática

El backend ejecuta una limpieza al arrancar (tras 1 minuto) y cada 24 horas (`backend/src/services/maintenance.ts`):

- Registro de actividad: se borra lo que supera `AUDIT_RETENTION_MONTHS` (12 meses por defecto; contiene IPs y correos).
- Cuentas sin confirmar: se eliminan las registradas por el sitio que no confirmaron su correo tras 24 horas y sin enlace vigente (el correo vuelve a quedar libre). No toca cuentas confirmadas ni las creadas por el administrador.
- Sesiones cerradas cuyo token ya venció.

Con varias instancias del backend la limpieza se ejecuta en cada una; es idempotente y no hay conflicto.
