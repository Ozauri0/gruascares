# Arquitectura del Sistema - Grúas Cares

Este documento describe la arquitectura global, patrones de diseño y flujo de datos para la plataforma web y sistema de gestión de Grúas Cares.

---

## 1. Visión General de la Solución

El sistema se compone de dos capas desacopladas sobre el runtime **Bun**:

```mermaid
graph TD
    Client[Cliente / Navegador]
    NextApp["Frontend: Next.js 16 (App Router)<br/>Port: 3000"]
    API["Backend: Express + TypeScript (Bun)<br/>Port: 4000"]
    DB[(PostgreSQL)]
    SMTP[Servidor SMTP / Resend]
    WA[WhatsApp API / Link Directo]

    Client -->|Páginas públicas & Paneles| NextApp
    NextApp -->|Llamadas API REST / Cookies HTTP-Only| API
    API -->|Consultas SQL / ORM| DB
    API -->|Notificaciones transaccionales| SMTP
    Client -->|Contacto rápido| WA
```

---

## 2. Capas del Sistema

### 2.1. Frontend (Next.js 16)
- **Localización**: Raíz del proyecto (`/app`, `/public`, etc.).
- **Responsabilidad**: Presentación de la web corporativa, catálogo visual, agenda pública y los 3 portales/paneles (`/portal`, `/mecanico`, `/admin`).
- **Navegación & Seguridad**:
  - Middleware de Next.js para inspección de sesión y redirección por rol antes de renderizar la página.
  - Contexto de autenticación en React (`AuthContext`) para actualizar estado en el cliente.
- **Estilos**: Sistema de diseño basado en la identidad oficial en `app/globals.css`.

### 2.2. Backend (Express + TypeScript)
- **Localización**: `/backend`.
- **Runtime**: Bun (máximo rendimiento y compatibilidad nativa con TypeScript sin necesidad de transpilación lenta).
- **Patrón de Arquitectura**: Capas (Controller -> Service -> Repository/ORM).
- **Seguridad**:
  - Helmet para cabeceras HTTP seguras.
  - CORS configurado exclusivamente para el dominio del frontend.
  - Rate limiting en rutas de autenticación (`/api/auth/*`).
  - Passwords hasheadas con `bcrypt`.
  - Tokens JWT firmados o sesiones persistidas en cookies `httpOnly`, `SameSite=Lax`, `Secure`.

### 2.3. Base de Datos (PostgreSQL)
- **Modelos Principales**:
  - **`users`**: Administradores, mecánicos y clientes.
  - **`vehicles`**: Vehículos asociados a clientes (patente, marca, modelo, año, kilometraje).
  - **`services`**: Catálogo de servicios ofrecidos (grúa de rescate, cambio de aceite, mantención preventiva, etc.).
  - **`appointments`**: Citas y solicitudes con fechas, bloques horarios, estado del flujo y mecánico asignado.
  - **`service_records`**: Bitácora técnica post-atención (informe técnico, repuestos cambiados, recomendaciones).

---

## 3. Flujo de Estados de una Cita en Serviteca

```mermaid
stateDiagram-v2
    [*] --> Solicitada: Usuario agenda en la web
    Solicitada --> Confirmada: Taller/Admin aprueba horario
    Solicitada --> Cancelada: Falta de cupo o rechazo cliente
    Confirmada --> En_Taller: Mecánico recibe el vehículo
    En_Taller --> Finalizada: Mecánico completa el trabajo y redacta informe
    Finalizada --> [*]: Se dispara correo con el resumen técnico
    Cancelada --> [*]: Se notifica por correo motivo de cancelación
```

---

## 4. Política de Notificaciones
- **Notificaciones operativas y transaccionales**: Se realizan exclusivamente vía **correo electrónico** (creación de cuenta, confirmación de cita, cambio de estado, resumen de atención técnica).
- **Contacto comercial / emergencias inmediatas**: Se canaliza a través del **botón flotante de WhatsApp** en el frontend público para comunicación humana inmediata.
