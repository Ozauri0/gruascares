# Registro de Decisiones de Arquitectura (ADR) - Grúas Cares

Este documento contiene la justificación histórica y técnica de cada decisión adoptada para el desarrollo de la plataforma. Cualquier cambio futuro en el rumbo técnico debe documentarse aquí.

---

### ADR 001: Adopción de Bun como Runtime Principal
- **Fecha**: 2026-10-02
- **Estado**: Aceptado
- **Contexto**: El proyecto original utilizaba Node/npm, pero el equipo de desarrollo estandarizó el uso de Bun para acelerar builds y ejecuciones locales.
- **Decisión**: Se utiliza `bun` para la gestión de dependencias, scripts de Next.js (`bun run build`, `bun dev`) y como runtime del backend Express.
- **Consecuencias Positivas**:
  - Tiempos de arranque y compilación ultrarrápidos (builds en ~100ms con Turbopack).
  - Soporte nativo para TypeScript sin necesidad de herramientas como `ts-node` o pasos complejos de build en backend.

---

### ADR 002: Separación Frontend (Next.js) y Backend (Express)
- **Fecha**: 2026-10-02
- **Estado**: Aceptado
- **Contexto**: Se requería un sistema con 3 roles de usuario distintos (admin, mecánico, usuario) y lógica operativa para un equipo de 2 desarrolladores trabajando en paralelo.
- **Decisión**: Mantener el frontend en Next.js (App Router) y crear un backend dedicado en `/backend` con Express + TypeScript.
- **Consecuencias Positivas**:
  - Desacoplamiento total: Dev 1 puede trabajar en las APIs y la base de datos sin generar conflictos de merge con Dev 2, que trabaja en las vistas de React/Next.js.
  - Independencia de escalabilidad y despliegue para la API REST.

---

### ADR 003: Notificaciones por Correo Electrónico en lugar de Automatizaciones por WhatsApp
- **Fecha**: 2026-10-02
- **Estado**: Aceptado
- **Contexto**: Se evaluó enviar confirmaciones y reportes automáticos vía WhatsApp Business API vs. Correo Electrónico.
- **Decisión**: Implementar el envío de notificaciones automáticas (confirmaciones de citas, hojas de atención técnica) mediante **correo electrónico** (SMTP/Nodemailer/Resend). El uso de WhatsApp se reserva exclusivamente como un botón CTA en la web para contacto humano directo.
- **Consecuencias Positivas**:
  - Costo cero/mínimo inicial y sin dependencia de aprobaciones complejas de Meta/WhatsApp Cloud API.
  - Facilidad de envío de resúmenes formales y comprobantes que el cliente puede guardar en su bandeja.
  - Mantiene el canal de WhatsApp libre para emergencias y atención rápida 24/7.

---

### ADR 004: Modelo RBAC (Role-Based Access Control) con 3 Roles
- **Fecha**: 2026-10-02
- **Estado**: Aceptado
- **Contexto**: Las necesidades del negocio involucran 3 tipos de actores claramente diferenciados.
- **Decisión**: Definir tres roles estrictos:
  1. `admin`: Control total de la empresa, métricas, personal y configuración.
  2. `mecanico`: Visualización de agenda de taller, registro de kilometraje, diagnósticos y finalización de citas.
  3. `usuario`: Cliente registrado, registro de sus vehículos y solicitud/revisión de citas.
- **Consecuencias Positivas**:
  - Clara delimitación de permisos tanto en middlewares de Express como en el middleware de Next.js.
  - Interfaces limpias y focalizadas para cada perfil de usuario.

---

### ADR 005: Hoja de Vida Vehicular ligada a Patentes Chilenas
- **Fecha**: 2026-10-02
- **Estado**: Aceptado
- **Contexto**: En la serviteca, los clientes atienden distintos vehículos (autos particulares, camionetas, camiones de trabajo).
- **Decisión**: Asociar las atenciones a un registro de vehículo (con patente, marca, modelo, año y kilometraje).
- **Consecuencias Positivas**:
  - Permite al cliente y al mecánico consultar el historial histórico de mantención por vehículo.
  - Facilita el diagnóstico y seguimiento de insumos recomendados en cada servicio.

---

### ADR 006: Solicitudes de cita sin sesión (invitado) no crean ni usan cuentas
- **Fecha**: 2026-10-15
- **Estado**: Aceptado
- **Contexto**: Agendar sin sesión creaba una cuenta con el correo indicado (y clave aleatoria) o asociaba la cita a la cuenta existente con ese correo. Cualquiera podía así "ocupar" el correo de otra persona (que luego no podía registrarse) o ensuciar el historial de cuentas ajenas, incluidas las de administración.
- **Decisión**: Una solicitud sin sesión se guarda con `user_id` nulo y los datos de contacto en `guest_name`, `guest_email` y `guest_phone` (restricción de BD: debe existir cuenta o correo de invitado). Nunca se busca ni crea un usuario. Al registrarse una cuenta, las solicitudes de invitado con el mismo correo se vinculan a ella.
- **Consecuencias**:
  - Positivas: se elimina la suplantación de cuentas y la creación de usuarios por el endpoint público; el taller sigue viendo nombre, correo y teléfono del solicitante (agenda y exportación).
  - Riesgo conocido: no hay verificación de correo, por lo que quien se registre primero con un correo ajeno vería las solicitudes de invitado de ese correo. Mitigación pendiente: verificación de correo al registrarse (a evaluar junto al flujo de recuperación de contraseña, issue #57).

---

### ADR 007: El frontend consume el backend por un proxy `/api` de Next (mismo origen)
- **Fecha**: 2026-10-15
- **Estado**: Aceptado
- **Contexto**: Frontend (puerto 3000) y backend (puerto 4000) viven en orígenes distintos. Hablar directo exige CORS con credenciales, cookies entre sitios y expone la URL del API al navegador.
- **Decisión**: `next.config.ts` reenvía `/api/:path*` a `BACKEND_URL`. El navegador solo conoce su propio origen; la cookie `httpOnly` de sesión es de primera parte y `SameSite=Lax` basta contra CSRF. El cliente `app/lib/api.ts` (`credentials: "include"`, errores tipados `ApiError`, 401 → `/login`) solo acepta rutas `/api/...`, y `app/lib/api-adapters.ts` convierte las respuestas del backend en los tipos de las pantallas.
- **Consecuencias**:
  - Positivas: sin CORS ni cookies cross-site; la CSP puede limitar `connect-src` a `'self'`; el backend puede quedar fuera de internet público.
  - A tener en cuenta: en producción el despliegue debe exponer el frontend y alcanzar al backend por red interna (`BACKEND_URL`); un proxy inverso (nginx) delante puede sustituir el rewrite sin cambiar el código del cliente.

---

### ADR 008: Login demo sin credenciales con sesión real (`demo-login`)
- **Fecha**: 2026-10-15
- **Estado**: Aceptado (temporal; se elimina antes de producción, issue #47)
- **Contexto**: El sitio es una demo y el acceso de cliente, mecánico y admin debe seguir sin pedir credenciales. Con el backend conectado, las rutas protegidas exigen una sesión real (JWT en cookie `httpOnly`).
- **Decisión**: `POST /api/auth/demo-login { role }` abre una sesión real para la cuenta sembrada del rol indicado. Solo existe con `DEMO_MODE=true`; con `NODE_ENV=production` el servidor se niega a arrancar si está activo. Solo funciona con cuentas del dominio reservado `@demo.test` (`cliente@`, `mecanico@`, `admin@`) y con el rol esperado; está limitado por IP y auditado (`DEMO_LOGIN`). `bun run db:seed` (solo desarrollo, idempotente) crea esas cuentas con datos coherentes.
- **Consecuencias**:
  - Positivas: toda la app usa datos y autorización reales también en la demo; el flujo "Entrar como…" no cambia para quien la usa.
  - Riesgos mitigados: no hay forma de elegir otro correo ni de usarlo en producción. Al salir de demo se borran `config/demo.ts`, el endpoint, `DEMO_MODE` y las cuentas demo.

---

### ADR 009: Los bloques horarios los define el backend
- **Fecha**: 2026-10-15
- **Estado**: Aceptado
- **Contexto**: El frontend generaba 21 bloques ficticios (08:00–18:00 cada 30 min) y el backend ofrece 8 (`DEFAULT_TIME_SLOTS`: 08:30, 09:30, 10:30, 11:30, 14:00, 15:00, 16:00, 17:00) con capacidad por bloque, bloqueos del administrador y hora de Chile.
- **Decisión**: `GET /api/appointments/availability` es la única fuente de verdad. `/agendar` pinta los bloques que devuelve (disponible, ocupado, ya transcurrido o bloqueado con motivo) y se eliminó el generador de bloques del frontend. Los bloques predefinidos están en `backend/src/config/constants.ts` y el admin añade los propios por día (ADR 011).
- **Consecuencias**: la web nunca ofrece un horario que el backend rechazaría; si el taller quiere otros bloques se cambia en un solo lugar (a futuro, desde el panel de administración).

---


### ADR 011: Horarios propios por día y bloqueo por bloque

- **Contexto**: El calendario maestro solo bloqueaba días completos y los bloques eran fijos (`DEFAULT_TIME_SLOTS`).
- **Decisión**: tabla `custom_time_slots (date, time_slot)`; los horarios de un día son los predefinidos más los propios de esa fecha (`slotsForDate`). El admin los gestiona con `GET /api/admin/schedule?date=`, `POST /api/admin/time-slots` y `DELETE /api/admin/time-slots/:id` (se niega con citas activas y limpia sus bloqueos). El bloqueo de un bloque usa `POST /api/admin/blocked-dates` con `timeSlot`, ahora validado contra los horarios del día. `/agendar` no cambia: sigue pintando lo que devuelve la disponibilidad.
- **Consecuencias**: no se pueden quitar los bloques predefinidos de un día (se bloquean); los horarios propios son por fecha, no recurrentes.

### ADR 010: Recuperación de contraseña por enlace de un solo uso
- **Fecha**: 2026-10-15
- **Estado**: Aceptado
- **Contexto**: No existía forma de recuperar una cuenta, y al no verificarse el correo al registrarse, alguien podía "ocupar" el correo de otra persona (ver ADR 006). Con recuperación, el dueño real del buzón puede recuperar el control.
- **Decisión**: `POST /api/auth/forgot-password` responde siempre igual (no revela qué correos existen) y, si la cuenta existe y está activa, envía un enlace `APP_URL/restablecer?token=…` válido 60 minutos. `POST /api/auth/reset-password` consume el token de forma atómica, aplica la política de contraseñas, cierra todas las sesiones de la cuenta (`token_version`) e invalida los enlaces pendientes. El token solo se guarda como hash SHA-256; hay límites de tasa por IP+correo. `PATCH /api/auth/me` edita nombre y teléfono (no correo ni rol).
- **Consecuencias**: la pantalla de recuperación y la de perfil del frontend se conectan en un issue aparte. Sigue pendiente verificar el correo al registrarse (mitigado, no eliminado).

### ADR 012: Bloqueo masivo por día de la semana y cambio de hora por el taller

- **Contexto**: El admin necesitaba bloquear fines de semana de todo el año y mover citas a pedido de un cliente o mecánico; el panel del día obligaba a mucho scroll.
- **Decisión**: `POST /api/admin/blocked-dates/bulk` (y `/bulk-remove`) bloquea o desbloquea días completos en un rango (máx. 400 días) según días de la semana (0 = domingo); omite los ya bloqueados e informa cuántas citas existentes caen en esos días sin cancelarlas. `PATCH /api/admin/appointments/:id/reschedule` mueve citas solicitadas o confirmadas validando horario del día, bloqueos y cupo con el mismo candado que el agendamiento, y avisa al cliente por correo. El panel del día se reorganizó en pestañas (Citas / Horarios) con horarios como chips y es sticky en escritorio.
- **Consecuencias**: un año completo son dos operaciones (rango de hasta 400 días); mover una cita no cambia su estado ni su mecánico.
