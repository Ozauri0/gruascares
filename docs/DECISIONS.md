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
- **Estado**: Reemplazado por el ADR 014 (agendar exige sesión); se conserva como historial de las solicitudes de invitado antiguas
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
- **Contexto**: El frontend generaba 21 bloques ficticios (08:00–18:00 cada 30 min) y el backend ofrecía 8 (`DEFAULT_TIME_SLOTS`; desde ADR 015 son 12: 08:30 a 19:30 cada hora) con capacidad por bloque, bloqueos del administrador y hora de Chile.
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

### ADR 013: Contenido del sitio editable desde un panel de administración

- **Contexto**: El admin necesita cambiar textos e imágenes de la web pública sin tocar código. Se evaluó edición directa sobre la página frente a un panel aparte.
- **Decisión**: panel aparte (`/admin/contenido`) con vista previa del sitio al lado. Edición "en página" se descartó por ahora: exige modo de edición dentro de páginas públicas (con CSP, accesibilidad y riesgo de que un visitante vea herramientas de edición) y no aporta más para textos e imágenes. Los campos y sus valores originales viven en `app/lib/site-content.ts`; el backend solo guarda lo editado (`site_content`, `GET /api/content` público, `PUT /api/admin/content`). `app/layout.tsx` lee el contenido en el servidor en cada página y lo entrega por contexto; si el backend no responde se ve el original. Los textos se muestran como elementos React (nunca HTML crudo); el formato permitido es salto de línea y `*énfasis*`.
- **Imágenes**: se pueden subir (PNG/JPG/WebP, máx. 5 MB, validadas por su contenido real) a `UPLOADS_DIR` y se sirven en `/api/uploads/…`, o elegirse de la galería local. No se aceptan URLs externas (la CSP solo admite orígenes propios). Las imágenes de producto del catálogo siguen su propio mecanismo.
- **Consecuencias**: las páginas públicas pasan a renderizarse en el servidor por petición; `UPLOADS_DIR` debe persistirse en producción; la vista previa obliga a permitir marcos del mismo origen (`X-Frame-Options: SAMEORIGIN`, `frame-ancestors 'self'`). Para volver editable otro texto basta con agregarlo a `SECTIONS`. Los teléfonos y enlaces a redes no se editan (datos verificados del negocio).

### ADR 013 (revisión): edición sobre la propia página, con borrador y publicación

El editor vive en la página pública, como en WordPress: al iniciar sesión como admin aparece "✏️ Editar página" (Inicio y Tienda; también `?editar=1`). En modo edición se resalta lo editable, tocar un texto o imagen abre su campo en un panel flotante y nada navega. Los cambios se ven al instante solo en ese navegador y se guardan como **borrador** (`site_content_draft`, migración 0008; `PUT /api/admin/content/draft`); el público sigue viendo lo publicado hasta "Publicar" (`POST /api/admin/content/publish`). "Descartar borrador" (`DELETE /api/admin/content/draft`) no toca lo publicado. `ContentEditor` identifica los elementos comparando el contenido de cada campo con la página (`app/lib/edit-dom.ts`), sin alterar ningún texto (insertar caracteres invisibles rompía la tipografía). Todo el código del modo edición exige `role === "admin"` y los endpoints están protegidos por la API de admin. El antiguo editor con iframe se retiró (el marco volvió a poder relajarse, pero no se revirtió `frame-ancestors 'self'`, inocuo).

---

### ADR 014: Agendar exige iniciar sesión
- **Fecha**: 2026-10-17
- **Estado**: Aceptado (issue #124)
- **Contexto**: Las solicitudes de invitado se aceptaban con un correo sin verificar: cualquiera podía llenar los cupos de la agenda con citas falsas (solo limitado por IP) y el taller recibía solicitudes y enviaba correos a direcciones de terceros.
- **Decisión**: `POST /api/appointments` exige sesión (`authenticate`) y se elimina la rama de invitado. La cita se asocia siempre a la cuenta (que ya confirmó su correo); nombre y correo del cuerpo se ignoran. `/agendar` es una ruta protegida: sin sesión redirige a `/login?redirect=…` y se vuelve a la ruta tras iniciar sesión (también tras crear la cuenta y confirmar el correo, vía `localStorage` con vigencia de 1 hora). Una persona no puede ocupar dos veces el mismo horario. Las solicitudes de invitado ya existentes se conservan (`guest_*`) y se vinculan al confirmar el correo.
- **Consecuencias**: baja la fricción de abuso; sube la de una persona nueva (debe crear cuenta y confirmar el correo). Para emergencias se mantiene el teléfono 24/7 visible.

### ADR 015: Horario base 08:30–19:30 y tope de 4 citas por horario
- **Fecha**: 2026-10-24
- **Estado**: Aceptado (issue #126)
- **Contexto**: El cliente pidió horarios de la serviteca de 08:30 a 19:30 (hora de Chile), uno por hora. Los 8 bloques anteriores tenían una pausa de almuerzo y un tope de 2 citas.
- **Decisión**: `DEFAULT_TIME_SLOTS` (`backend/src/config/constants.ts`) pasa a 12 bloques: 08:30, 09:30, … 19:30, todos los días, para serviteca y grúa. `MAX_CONCURRENT_APPOINTMENTS_PER_SLOT` sube a 4: al llegar a 4 el horario aparece lleno (`available: false`) y no admite más solicitudes ni reprogramaciones; el candado por (fecha, bloque) evita pasar del tope con reservas simultáneas. Las citas ya existentes en horarios antiguos se conservan. Ambos valores viven solo en ese archivo, porque el cliente puede cambiarlos.

### ADR 016: Rol `grua` y panel de grúas separado del taller
- **Fecha**: 2026-10-24
- **Estado**: Aceptado (issue #129)
- **Contexto**: Taller y grúas compartían el panel del mecánico. El cliente quiere vistas separadas: el servicio de grúa (trasladar un auto, un contenedor, etc.) lo gestiona un jefe propio.
- **Decisión**: nuevo rol `grua` (migración 0014; también como rol adicional). `/grua` y `/mecanico` usan el mismo tablero (`WorkshopBoard`) con textos propios; cada uno muestra solo las citas de su categoría (`grua` / `serviteca`). El backend lo impone: `GET /api/mechanic/agenda?area=` responde 403 a quien no es de esa área, y estado, informe técnico y asignación exigen `canWorkOn(usuario, categoría)` (jefe del área o admin). El encargado de una cita debe tener el rol del área (mecánico para serviteca, grúa para grúas) o ser admin. El admin ve ambas áreas. El rol grúa puede buscar clientes por RUT y agendarles citas, pero no crear perfiles (solo ventas y admin).
- **Consecuencias**: hoy el encargado sigue siendo una cuenta con rol; los trabajadores sin cuenta llegan con el issue #130, que reemplaza esta asignación. La auditoría de grúas queda en el área «Taller».

### ADR 017: Trabajadores sin cuenta; solo los jefes de área usan la plataforma
- **Fecha**: 2026-10-24
- **Estado**: Aceptado (issue #130)
- **Contexto**: Quienes hacen los trabajos (mecánicos y grueros) no usan la plataforma: solo los jefes de área aceptan solicitudes y reparten el trabajo. Hasta ahora el «mecánico a cargo» tenía que ser una cuenta con login.
- **Decisión**: tabla `workers` (nombre, RUT único, teléfono, `types` = `mecanico` y/o `gruero`, activo). `appointments.worker_id` y `service_records.worker_id` reemplazan a `mechanic_id` (migraciones 0015 y 0016; el respaldo de asignaciones existentes convierte a cada cuenta que figuraba como mecánico en un trabajador). Además `appointments.managed_by` y `service_records.authored_by` guardan al jefe de área (cuenta) que gestionó la solicitud o registró el informe: sirve para medir quién pidió, quién gestionó y quién hizo cada servicio. `GET/POST/PATCH /api/workers`: el jefe de taller ve y edita mecánicos, el de grúas grueros y el admin todos; un trabajador con ambos tipos aparece en las dos listas y cada jefe solo cambia los tipos de su área. No se borran: se dan de baja (`isActive`) y el historial conserva su nombre. Asignar exige un trabajador activo del tipo del servicio (mecánico para serviteca, gruero para grúas); iniciar la atención exige uno asignado. `GET /api/mechanic/list` se retira; `GET /api/mechanic/agenda?area=todas` (solo admin) alimenta el calendario de administración.
- **Consecuencias**: eliminar la cuenta de un jefe ya no está bloqueado por sus informes (quedan sin autor, con el trabajador). Los reportes por trabajador salen de estas columnas (issue #131).

### ADR 018: Reportes Excel generados sin librería de planillas
- **Fecha**: 2026-10-24
- **Estado**: Aceptado (issue #131)
- **Contexto**: El admin necesita planillas de taller y grúas para medir el rendimiento de los trabajadores. Las librerías habituales (`exceljs`) arrastran dependencias con vulnerabilidades conocidas (5 en `bun audit`, una alta) y el proyecto mantiene la auditoría limpia.
- **Decisión**: `utils/xlsx.ts` escribe el .xlsx (Office Open XML) a mano y lo comprime con `fflate` (sin dependencias). Los textos se guardan como cadenas, nunca como fórmulas, y se eliminan los caracteres de control. `GET /api/admin/reports/:area` (`taller` o `grua`; solo admin; filtros de fecha y estado; tope `exportMaxRows`) entrega dos hojas: resumen por trabajador (servicios por estado, % finalizadas sin contar canceladas y horas promedio entre la solicitud y la finalización) y los servicios con quién pidió, trabajador a cargo, jefe que gestionó e informe. Cada descarga queda en la auditoría (`DATA_EXPORT_REPORT`). Se comprobó que LibreOffice abre el archivo.
- **Consecuencias**: formato propio mínimo (sin gráficos ni fórmulas); si se necesitan más prestaciones conviene evaluar una librería cuando esté libre de vulnerabilidades.

### ADR 019: Reclamo de perfiles presenciales con teléfono, límite por RUT y registro de actividad
- **Fecha**: 2026-10-24
- **Estado**: Aceptado (issue #133)
- **Contexto**: Un perfil creado presencialmente (sin contraseña) se completa cuando su dueño se registra con el mismo RUT. Los RUT no son secretos: bastaba conocer el de un cliente y confirmar un correo propio para ver su historial y dejarlo fuera.
- **Decisión**: para reclamar el perfil, el teléfono del registro debe coincidir con el que dejó en el local (se comparan los últimos 8 dígitos, sin importar el formato). Un RUT con cuenta y un perfil presencial con otro teléfono reciben la misma respuesta (409 genérico), así no se descubre qué RUT tienen perfil. Los intentos están limitados por RUT (6 por hora, desde cualquier red, además del límite por IP; falla cerrado si Redis no responde). Cada intento rechazado (`PROFILE_CLAIM_REJECTED`) y cada reclamo (`PROFILE_CLAIMED`, con cuántos vehículos y citas traía) queda en el registro de actividad con nivel «Aviso». El correo se sigue confirmando antes de dar acceso.
- **Consecuencias**: quien cambió de número debe pedir al taller que actualice su perfil; el personal puede editarlo desde Usuarios. Alguien que conozca RUT **y** teléfono del cliente sigue pudiendo reclamar, pero queda registrado.

### ADR 020: Atención por RUT en el mostrador para ventas y admin, no para taller ni grúas
- **Fecha**: 2026-10-24
- **Estado**: Aceptado (issue #144)
- **Contexto**: Agendar o registrar clientes por RUT (issues #127/#128) estaba abierto a taller, grúas y admin.
- **Decisión**: `/atencion-presencial`, `GET /api/clients/by-rut`, `POST /api/clients` y agendar a nombre de otro cliente (`POST /api/appointments` con RUT o cliente) exigen el rol **vendedor** o **admin** (el admin tiene acceso a todo); mecánico y grúa reciben 403 y no ven el acceso. Quien deba hacerlo recibe el rol de ventas adicional.
- **Consecuencias**: crear cuentas con RUT desde «Usuarios y equipo» no cambia.

### ADR 021: Solicitud de grúa con datos de traslado
- **Fecha**: 2026-10-24
- **Estado**: Aceptado (issues #141 y #142)
- **Contexto**: La grúa no siempre lleva el vehículo al taller: traslada autos, camiones, contenedores, maquinaria u otras cargas a cualquier destino.
- **Decisión**: `appointments` suma `cargo_type` (auto, camioneta, camion, contenedor, maquinaria, otro), `destination` y `cargo_details`; `location` pasa a ser el lugar de retiro. Para servicios de grúa el backend exige los cuatro datos (`utils/cargo.ts`) y para los demás los descarta. El vehículo guardado solo se ofrece si lo que se traslada tiene patente. La ficha de cierre de una grúa es solo un comentario (el backend ignora kilometraje, repuestos y recomendaciones en ese caso). El panel `/grua` y el reporte Excel de grúas muestran los datos del traslado.
- **Consecuencias**: las solicitudes de grúa anteriores no tienen estos datos (columnas vacías); no se migran.

### ADR 022: Ventas y admin pueden agendar sobre bloqueos del calendario maestro
- **Fecha**: 2026-10-28
- **Estado**: Aceptado (issue #161)
- **Contexto**: Los días y horarios bloqueados por el administrador impedían que el mostrador registrara una atención presencial, aunque el local estuviera atendiendo.
- **Decisión**: `GET /api/appointments/availability?ignoreBlocks=true` (con sesión de **vendedor** o **admin**) devuelve los bloqueos como horarios agendables, marcados con `blocked: true` y su motivo; `POST /api/appointments` acepta `ignoreBlocks: true` solo de esos roles (los demás reciben 403). Solo se omite el bloqueo: los horarios ya transcurridos y el tope de citas por horario siguen vigentes. Cada cita creada así guarda `bypassedBlock` (el motivo) en el registro de actividad. Solo `/atencion-presencial` usa esta opción; `/agendar` y el portal del cliente siguen sujetos al calendario.
- **Consecuencias**: el calendario maestro sigue siendo obligatorio para clientes, taller y grúas.
