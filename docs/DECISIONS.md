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
