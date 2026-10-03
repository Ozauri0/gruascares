# Backlog de Proyecto: Grúas Cares Web & Sistema de Gestión

Este documento es el tablero central de trabajo para el equipo de desarrollo. Define las épicas, tareas, criterios de aceptación y asignación para **Dev 1 (Backend & DB)** y **Dev 2 (Frontend & UI/UX)**.

---

## 📌 Resumen del Stack y Reglas de Trabajo
- **Runtime**: [Bun](https://bun.sh) (`bun run dev`, `bun run build`, `bun test`, etc.).
- **Frontend**: Next.js 16 (App Router) + TypeScript + CSS nativo optimizado.
- **Backend**: Express + TypeScript corriendo con Bun en `/backend`.
- **Base de Datos**: PostgreSQL + ORM (Drizzle / Prisma).
- **Notificaciones**: Correo electrónico transaccional (ej. confirmación y recordatorio de citas, cambio de estado de atención).
- **Canal de Contacto Rápido**: Botón flotante CTA de WhatsApp en el frontend público para emergencias/consultas directas.
- **Roles de Usuario (RBAC)**:
  - `admin`: Administradores de Grúas Cares. Acceso total a reportes, usuarios, catálogo y configuración.
  - `mecanico`: Personal técnico de la serviteca. Acceso a agenda de taller, fichas de vehículos y registro de atenciones.
  - `usuario`: Clientes registrados. Acceso a solicitar horas, registrar vehículos y ver historial de atenciones.

---

## 👥 Asignación de Roles por Desarrollador

| Desarrollador | Usuario GitHub | Enfoque Principal | Responsabilidades |
| :--- | :--- | :--- | :--- |
| **Dev 1** | **[@Ozauri0](https://github.com/Ozauri0)** | **Backend, Base de Datos & APIs** | Estructura de servidor Express, modelos PostgreSQL, autenticación JWT/RBAC, lógica de slots/disponibilidad de taller, servicio de envío de correos y endpoints de gestión. |
| **Dev 2** | **[@eduardoscrs](https://github.com/eduardoscrs)** | **Frontend, UI/UX & Paneles** | Botón flotante de WhatsApp, vistas del portal de usuario, panel de mecánicos, panel de administración, autenticación en Next.js (cookies/tokens) y conexión con la API. |

---

## 📋 Tablero de Tareas

### 🚀 Fase 1: Cimientos, Base de Datos y Autenticación

#### [Dev 1] Backend & Base de Datos
- [ ] **T1.1: Inicialización de `/backend` con Bun y Express**
  - **Descripción**: Crear estructura del servidor en TypeScript con Bun, Express, CORS, Helmet y variables de entorno.
  - **Criterios de Aceptación**: Servidor corre con `bun run dev`, responde en `GET /health` con status 200 y maneja `.env.example`.
- [ ] **T1.2: Esquema de Base de Datos PostgreSQL & Migraciones**
  - **Descripción**: Modelar tablas iniciales con ORM:
    - `users` (id, name, email, password_hash, role [admin, mecanico, usuario], phone, created_at).
    - `vehicles` (id, user_id, plate [patente], brand, model, year, mileage).
    - `services` (id, category [grua, serviteca], name, description, base_price, estimated_duration_min).
    - `appointments` (id, user_id, vehicle_id, service_id, mechanic_id, scheduled_date, time_slot, status [solicitada, confirmada, en_proceso, finalizada, cancelada], notes).
    - `service_records` (id, appointment_id, mechanic_id, observations, parts_replaced, mileage_at_service, completed_at).
  - **Criterios de Aceptación**: Migraciones aplicables con `bun run db:migrate`, relaciones foráneas e índices en `plate`, `user_id` y `scheduled_date`.
- [ ] **T1.3: Módulo de Autenticación y Autorización (RBAC)**
  - **Descripción**: Implementar registro de usuarios, login con bcrypt y generación de JWT o sesiones con cookies HTTP-only.
  - **Criterios de Aceptación**: Endpoints `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`. Middlewares `authenticate` y `authorizeRoles(['admin', 'mecanico', ...])`.
- [ ] **T1.4: Servicio de Notificaciones por Correo Electrónico**
  - **Descripción**: Configurar servicio transaccional de correo (Nodemailer / Resend) con plantillas base HTML:
    - Bienvenida al registrarse.
    - Confirmación de solicitud de cita.
    - Notificación cuando la atención cambia a *Finalizada* con el resumen de trabajo.

#### [Dev 2] Frontend, Navegación & Autenticación
- [ ] **T2.1: Botón Flotante CTA de WhatsApp Global**
  - **Descripción**: Diseñar e integrar un botón flotante accesible en todas las páginas públicas con estilo corporativo Grúas Cares.
  - **Criterios de Aceptación**: Fijo en la esquina inferior, visible en móvil y desktop sin tapar elementos clave; redirige a WhatsApp (`+56991627809`) con mensaje prellenado según la sección.
- [ ] **T2.2: Sistema de Autenticación en Frontend & Manejo de Sesión**
  - **Descripción**: Crear `AuthContext` en React para manejar estado de sesión, token/cookie y usuario autenticado.
  - **Criterios de Aceptación**: Conectar formularios de `/login` y nuevo `/registro` a la API. Redirección automática según rol (`/portal` para usuarios, `/mecanico` para mecánicos, `/admin` para administradores).
- [ ] **T2.3: Middleware de Protección de Rutas en Next.js**
  - **Descripción**: Proteger rutas con el middleware nativo de Next.js según el rol contenido en la sesión.
  - **Criterios de Aceptación**: Rutas `/admin/*` solo accesibles por rol `admin`. Rutas `/mecanico/*` solo accesibles por `mecanico` o `admin`. Rutas `/portal/*` accesibles por usuarios autenticados.

---

### 🔧 Fase 2: Core de Serviteca, Agendamiento & Panel de Usuario

#### [Dev 1] APIs de Citas y Mecánicos
- [ ] **T1.5: API de Disponibilidad y Agendamiento de Citas**
  - **Descripción**: Endpoints para calcular bloques horarios disponibles por día según capacidad de mecánicos/bahías de taller.
  - **Criterios de Aceptación**: `GET /api/appointments/availability?date=YYYY-MM-DD` retorna solo slots libres. `POST /api/appointments` valida no solapamiento y dispara correo de confirmación.
- [ ] **T1.6: API de Vehículos del Usuario**
  - **Descripción**: CRUD de vehículos por usuario (`GET /api/vehicles`, `POST /api/vehicles`, `DELETE /api/vehicles/:id`).
  - **Criterios de Aceptación**: Validación de patente chilena (formato estándar), asociación estricta al `user_id` autenticado.
- [ ] **T1.7: API para Mecánicos (Gestión de Taller)**
  - **Descripción**: Endpoints específicos para el personal técnico:
    - `GET /api/mechanic/agenda`: Citas filtradas por fecha o estado.
    - `PATCH /api/appointments/:id/status`: Transición de estados (`en_proceso`, `finalizada`, `cancelada`).
    - `POST /api/appointments/:id/report`: Guardar bitácora técnica en `service_records`. Dispara correo al cliente con el reporte.

#### [Dev 2] Panel de Usuario (`/portal`)
- [ ] **T2.4: Vista Principal del Portal de Usuario**
  - **Descripción**: Dashboard personal del cliente con bienvenida, accesos directos y resumen de citas activas.
  - **Criterios de Aceptación**: Diseño limpio, adaptado a la estética de la marca (paleta negro/verde/gris claro).
- [ ] **T2.5: Módulo "Mis Vehículos"**
  - **Descripción**: Formulario para registrar vehículos (patente, marca, modelo, año, kilometraje) y listado en formato tarjeta.
  - **Criterios de Aceptación**: Interacción en tiempo real contra la API de vehículos, validación visual de campos.
- [ ] **T2.6: Módulo "Mis Citas e Historial de Atenciones"**
  - **Descripción**: Tabla / tarjetas con el historial de servicios realizados, estado en vivo de la cita y botón para ver el informe del mecánico (observaciones técnicas y repuestos).
  - **Criterios de Aceptación**: Muestra estados claros con etiquetas de color (`Solicitada` [amarillo], `Confirmada` [azul], `En Taller` [verde], `Finalizada` [verde oscuro]).
- [ ] **T2.7: Integración de `/agendar` con el Portal**
  - **Descripción**: Permitir que el usuario agende directamente seleccionando uno de sus vehículos registrados y recibiendo feedback con confirmación por correo.

---

### 🛠️ Fase 3: Paneles Operativos (Mecánico & Administrador)

#### [Dev 2] Panel de Mecánicos (`/mecanico`)
- [ ] **T2.8: Agenda Diaria del Mecánico**
  - **Descripción**: Vista calendario o lista cronológica con las horas agendadas para el día, visualizando cliente, vehículo, servicio y notas.
  - **Criterios de Aceptación**: Selector de fecha rápido, filtro por estado de cita, diseño optimizado para tablets/móvil de taller.
- [ ] **T2.9: Modal / Ficha de Atención en Taller**
  - **Descripción**: Interfaz para que el mecánico inicie la atención (`En Proceso`), ingrese kilometraje actual, observaciones técnicas, recomendaciones a futuro y marque como `Finalizada`.
  - **Criterios de Aceptación**: Guardado validado con retroalimentación inmediata; el cliente recibe su correo al finalizar.

#### [Dev 2] Panel de Administración (`/admin`)
- [ ] **T2.10: Dashboard General y Métricas**
  - **Descripción**: Resumen de negocio: citas agendadas hoy, servicios más solicitados, ingresos estimados y total de clientes registrados.
- [ ] **T2.11: Gestión de Usuarios y Personal**
  - **Descripción**: Tabla de usuarios con buscador, asignación de roles y creación de cuentas de mecánicos y administradores.
- [ ] **T2.12: Calendario Maestro & Bloqueo de Horarios**
  - **Descripción**: Vista global de todas las citas del taller y opción para bloquear días feriados o turnos no disponibles.

#### [Dev 1] APIs Administrativas & Seguridad
- [ ] **T1.8: Endpoints de Métricas y Reportes**
  - **Descripción**: `GET /api/admin/metrics` con agregaciones SQL optimizadas.
- [ ] **T1.9: Endpoints de Gestión de Taller y Horarios**
  - **Descripción**: Bloqueo de días/horas no laborales y asignación manual de mecánicos a citas.
- [ ] **T1.10: Auditoría y Respaldo**
  - **Descripción**: Logs estructurados de operaciones críticas y endpoints seguros para exportar historial en CSV/JSON.

---

## 🚦 Flujo de Git y Convenciones para 2 Desarrolladores
- **Rama principal**: `main` (siempre compilable y probada).
- **Ramas de trabajo**:
  - Dev 1: `feature/backend-*`
  - Dev 2: `feature/frontend-*`
- **Commits**: Formato convencional (`feat:`, `fix:`, `refactor:`, `docs:`).
- **Verificación**: Antes de mergear a `main`, ejecutar `bun run build` tanto en frontend como en backend.
