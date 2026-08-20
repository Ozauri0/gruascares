# Grúas Cares Mockup

## Overview

Mockup web para Grúas Cares, desarrollado desde cero con Next.js App Router. El proyecto parte de la identidad y contenido visible en `https://www.gruascares.cl/`, pero utiliza una composición visual nueva y más moderna.

La web es un prototipo frontend. No hay backend, autenticación real, inventario real ni pagos online.

## Stack

- Next.js 16 con App Router.
- React y TypeScript.
- CSS global en `app/globals.css`.
- Assets locales en `public/images`.
- Persistencia del carro mediante `localStorage`.

## Commands

```bash
npm install
npm run dev
npm run build
npm start
```

`npm run build` debe ejecutarse antes de considerar terminada una modificación.

## Routes

- `/`: Home principal con hero carrusel, servicios, catálogo destacado, agenda y contacto.
- `/catalogo`: Tienda visual de productos para autos, camiones y maquinaria.
- `/agendar`: Solicitud de servicios y productos. En desktop está diseñada para entrar en un viewport sin scroll.
- `/carro`: Lista de solicitud de productos. No procesa pagos ni compras online.
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

El catálogo está planteado como tienda visual:

- Top ventas: neumáticos para camión, aceite de motor y baterías.
- Productos adicionales: filtros, pastillas de freno, refrigerante, kit de emergencia, accesorios para carga, luces LED, plumillas y cables de batería.
- Cada producto muestra visual, nombre, descripción, precio referencial y stock referencial.
- Los precios y stocks son datos de mockup, no inventario real.
- El botón principal es `Agregar al carro`.
- El carro conserva productos en `localStorage` usando la clave `gruas-cares-cart`.

El carro no debe transformarse en checkout:

- No agregar pagos.
- No agregar datos de tarjeta.
- No simular compra confirmada.
- La acción final debe ser solicitar disponibilidad por teléfono o WhatsApp.
- La compra se coordina presencialmente o directamente con la tienda.

## Forms

Los formularios son demostrativos y muestran estados de confirmación local:

- `/agendar`: nombre, teléfono, servicio, fecha, ubicación y detalles.
- `/login`: correo y contraseña visuales, sin conexión a auth.
- Home: formulario simple de contacto.

No presentar confirmaciones como reservas o compras reales mientras no exista backend.

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
- Ejecutar `npm run build` después de cambios en páginas, componentes o estilos.
