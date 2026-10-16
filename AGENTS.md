# Grúas Cares Mockup

## Overview

Mockup web para Grúas Cares, desarrollado desde cero con Next.js App Router. El proyecto parte de la identidad y contenido visible en `https://www.gruascares.cl/`, pero utiliza una composición visual nueva y más moderna.

La web es un prototipo (demo) conectado a un backend propio: sesiones reales con cookie `httpOnly`, citas, vehículos, informes técnicos, catálogo y paneles de administración persisten en PostgreSQL. **El acceso de cliente, mecánico y admin se mantiene sin pedir credenciales** mediante los botones "Entrar como…" (`POST /api/auth/demo-login`, solo con `DEMO_MODE=true`); se elimina antes de producción (issue #47). Sigue sin haber pagos online ni inventario real: precios y stock son referenciales.

Guía de arranque, pruebas y variables de entorno: `docs/DEVELOPMENT.md`.

## Stack

- Runtime: Bun (`bun run dev`, `bun run build`).
- Frontend: Next.js 16 con App Router, React y TypeScript.
- Backend (en desarrollo): Express + TypeScript con Bun (`/backend`).
- Base de datos: PostgreSQL.
- CSS global en `app/globals.css`.
- Assets locales en `public/images`.
- Documentación y tareas: Ver `PROJECTS.md` y carpeta `docs/`.

## Commands

```bash
bun run setup:local      # Postgres + .env + dependencias + migraciones + datos demo
bun run backend:dev      # API en :4000
bun run dev              # sitio en :3000
bun run build            # build del frontend
bun run backend:build    # build del backend
bun run test             # pruebas del frontend
bun run backend:test     # pruebas del backend (requieren Postgres)
bun run backend:typecheck
bun run smoke            # recorrido de punta a punta con el sistema levantado
```

Antes de considerar terminada una modificación deben pasar `bun run build`, `bun run backend:build`, `bun run backend:typecheck`, `bun run test`, `bun run test:types` y `bun run backend:test`.

## Routes

- `/`: Home principal con hero carrusel, servicios, catálogo destacado, agenda y contacto.
- `/catalogo`: Tienda visual de productos para autos, camiones y maquinaria.
- `/agendar`: Solicitud de servicios y productos. En desktop está diseñada para entrar en un viewport sin scroll.
- `/carro`: Lista de solicitud de productos. No procesa pagos ni compras online.
- `/vendedor`: Panel del rol **vendedor** (gestiona el catálogo: precios, stock, visibilidad e imágenes; sin acceso al resto de la administración). El catálogo público solo muestra productos con stock.
- `/login`: Mockup de portal de clientes, sin autenticación real.

## Components

- `app/components/InnerHeader.tsx`: Header flotante liquid-glass para rutas internas.
- `app/components/InnerFooter.tsx`: Footer de rutas internas que lo necesitan.
- `app/components/CartProvider.tsx`: Contexto global del carro y persistencia en `localStorage`.
- `app/components/AddToCartButton.tsx`: Botón para agregar productos al carro.
- `app/components/CartLink.tsx`: Enlace del header con contador de productos.

## Visual System

La paleta fue extraída de la página original:

- Negro: `#000000`.
- Gris oscuro: `#333333`.
- Gris claro: `#f4f4f4`.
- Verde principal: `#029834`.
- Verde oscuro: `#017827`.
- Rosado de acento: `#ff6699`.

Tipografías usadas:

- Fira Sans para texto general.
- Space Grotesk para titulares.
- DM Mono para labels técnicos y metadatos.

El header usa una estética liquid-glass: fijo, compacto, translúcido, con blur, bordes redondeados y sombra suave.

## Original Site Facts

Usar únicamente información comprobada en la web original:

- Ubicación: Villarrica, IX Región de la Araucanía.
- Atención de emergencias 24/7.
- Cobertura mencionada: Villarrica y IX Región, no cobertura nacional.
- Teléfonos:
  - `+56 9 9162 7809`
  - `+56 9 6832 7329`
  - `+56 9 6857 4677`
- Servicios originales relevantes:
  - Grúa de plataforma hidráulica.
  - Transporte de cargas pesadas.
  - Camiones grúa.

No reintroducir claims no comprobados como años de experiencia, cobertura nacional, correo corporativo inventado o cifras comerciales no verificadas.

## Assets

Los assets se descargan localmente para evitar pixelación y dependencia de URLs externas.

- `public/images/logo.png`: logo original.
- `public/images/carousel-01.webp` a `carousel-04.webp`: imágenes originales del carrusel detectado en `.single-slide`.
- `public/images/service-*.jpg`: imágenes de secciones y servicios originales.
- `public/favicon.svg`: favicon del mockup.

El carrusel del hero debe usar únicamente las imágenes `carousel-*.webp`. No incluir el logo en el carrusel.

## Catalog And Cart

El catálogo vive en la base de datos (`GET /api/catalog` público; el admin lo gestiona en `/admin/catalogo`). Es una tienda visual:

- Top ventas: neumáticos para camión, aceite de motor y baterías.
- Productos adicionales: filtros, pastillas de freno, refrigerante, kit de emergencia, accesorios para carga, luces LED, plumillas y cables de batería.
- Cada producto muestra visual, nombre, descripción, precio referencial y stock referencial.
- Los precios y stocks son datos referenciales, no inventario real.
- Las imágenes de producto son una URL https o una ruta `/images/…` (no se guardan archivos en la base). Los productos de ejemplo usan fotos de referencia de Wikimedia Commons en `public/images/products/` (licencias libres; créditos en `/creditos`, datos en `app/creditos/credits.json`): no son fotos del stock real.
- `/catalogo` permite elegir entre cuadrícula y filas (se recuerda en `localStorage`).
- El botón principal es `Agregar al carro`.
- El carro conserva productos en `localStorage` usando la clave `gruas-cares-cart`.

El carro no debe transformarse en checkout:

- No agregar pagos.
- No agregar datos de tarjeta.
- No simular compra confirmada.
- La acción final debe ser solicitar disponibilidad por teléfono o WhatsApp.
- La compra se coordina presencialmente o directamente con la tienda.

## Editable Content

Los textos e imágenes de la web pública los edita el administrador sobre la propia página (botón "✏️ Editar página" al iniciar sesión como admin; también con `?editar=1`; ya no existe un módulo aparte en el panel). Los cambios se guardan como borrador y el público solo los ve al "Publicar". El catálogo de campos y sus valores originales está en `app/lib/site-content.ts`: para volver editable un texto nuevo, agrégalo ahí y úsalo con `useSiteContent()` (`t("clave")`) en lugar de escribirlo fijo. Las claves de imagen terminan en `.image`. Los teléfonos del pie de página sí se editan (formato `+56 9 XXXX XXXX`); no son editables a propósito el teléfono de la barra superior y los enlaces a redes (datos verificados del sitio original). El menú del modo edición se mueve arrastrando su asa (⠿).

## Forms

Los formularios envían datos reales a la API:

- `/agendar`: crea una **solicitud** de cita (`POST /api/appointments`). Queda "pendiente de confirmación" hasta que el taller la confirme; no presentarla como reserva confirmada. Sin sesión se guarda como solicitud de invitado (no crea cuentas).
- `/login`: credenciales reales o acceso demo (botones). `/registro`: cuenta real.
- Home: el formulario de contacto sigue siendo demostrativo (no tiene endpoint).

## Responsive Behavior

- Desktop: header flotante y rutas operativas como `/agendar` y `/carro` diseñadas para ocupar un viewport.
- Mobile: se permite scroll cuando la cantidad de campos o productos lo requiere.
- Mantener el header liquid-glass compacto en móvil.
- Mantener CTAs táctiles y evitar elementos pegados a los bordes.

## Change Guidelines

- Reutilizar componentes existentes antes de crear variantes duplicadas.
- Mantener los assets locales.
- Mantener el flujo de compra como solicitud directa, no e-commerce transaccional.
- No cambiar la paleta sin contrastarla con la identidad original.
- Ejecutar `bun run build` (y las pruebas) después de cambios en páginas, componentes o estilos.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
