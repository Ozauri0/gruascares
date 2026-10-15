# Grúas Cares

Plataforma web de **Grúas Cares** (Villarrica, IX Región de la Araucanía): sitio público, tienda visual de productos, agendamiento de servicios y paneles para clientes, mecánicos y administración.

- **Frontend**: Next.js 16 (App Router) + TypeScript — raíz del repositorio.
- **Backend**: Express + TypeScript sobre Bun — `/backend`.
- **Base de datos**: PostgreSQL (Docker) con Drizzle ORM.

## Arranque rápido

```bash
bun run setup:local     # Postgres + .env + dependencias + migraciones + datos demo
bun run backend:dev     # API  → http://localhost:4000
bun run dev             # Web  → http://localhost:3000
```

Entra desde `/login` con los botones **Entrar como Cliente / Mecánico / Admin** (acceso demo, sin credenciales).

## Documentación

- [Guía de desarrollo](docs/DEVELOPMENT.md): arranque, variables, pruebas, migraciones y problemas frecuentes.
- [Arquitectura](docs/ARCHITECTURE.md) y [decisiones (ADR)](docs/DECISIONS.md).
- [Backlog y flujo de trabajo](PROJECTS.md).
- [Instrucciones del proyecto para agentes](AGENTS.md).

## Verificar un cambio

```bash
bun run backend:test && bun run backend:typecheck && bun run test && bun run test:types && bun run build && bun run backend:build
bun run smoke           # con el sistema levantado
```
