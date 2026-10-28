import { pgTable, uuid, varchar, text, integer, boolean, timestamp, date, pgEnum, index, unique, uniqueIndex } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// 1. Enums
export const userRoleEnum = pgEnum("user_role", ["admin", "mecanico", "usuario", "vendedor", "grua"]);
export const workerTypeEnum = pgEnum("worker_type", ["mecanico", "gruero"]);
export const serviceCategoryEnum = pgEnum("service_category", ["grua", "serviteca"]);
export const productArtEnum = pgEnum("product_art", ["tyre", "oil", "battery"]);
export const appointmentStatusEnum = pgEnum("appointment_status", [
  "solicitada",
  "confirmada",
  "en_proceso",
  "finalizada",
  "cancelada",
]);

// 2. Tabla Usuarios
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  rut: varchar("rut", { length: 15 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  // Nulo en perfiles creados presencialmente sin correo; único cuando existe.
  email: varchar("email", { length: 255 }).unique(),
  // Nulo en perfiles sin cuenta web (creados presencialmente); sin contraseña no puede iniciar sesión.
  passwordHash: text("password_hash"),
  role: userRoleEnum("role").default("usuario").notNull(),
  // Roles adicionales (p. ej. un mecánico que también vende). El rol principal define su página de inicio.
  extraRoles: userRoleEnum("extra_roles").array().default(sql`'{}'::user_role[]`).notNull(),
  phone: varchar("phone", { length: 50 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  // Confirmación del correo: null = aún no confirmó el enlace que se le envió al registrarse (no puede iniciar sesión).
  emailVerifiedAt: timestamp("email_verified_at"),
  // Se incrementa para invalidar todas las sesiones activas del usuario (cambio de rol, baja, cierre global).
  tokenVersion: integer("token_version").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 2b. Trabajadores: personal que hace los servicios (mecánicos y grueros). No tienen cuenta ni inician sesión;
// los jefes de área (usuarios con rol) los registran y les asignan las solicitudes.
export const workers = pgTable(
  "workers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    rut: varchar("rut", { length: 15 }).notNull().unique(),
    phone: varchar("phone", { length: 50 }),
    // Puede ser mecánico, gruero o ambos.
    types: workerTypeEnum("types").array().notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("workers_is_active_idx").on(table.isActive)]
);

// 2c. Flota: las grúas de la empresa. Cada una puede tener un gruero (trabajador sin cuenta) a cargo.
export const cranes = pgTable(
  "cranes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    plate: varchar("plate", { length: 10 }).notNull().unique(),
    // plataforma | camion_grua | otro (validado en el controlador y por un CHECK en la migración).
    type: varchar("type", { length: 20 }).default("otro").notNull(),
    notes: text("notes"),
    workerId: uuid("worker_id").references(() => workers.id, { onDelete: "set null" }),
    isActive: boolean("is_active").default(true).notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("cranes_worker_id_idx").on(table.workerId)]
);

// 3. Tabla Vehículos
export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    plate: varchar("plate", { length: 20 }).notNull(),
    brand: varchar("brand", { length: 100 }).notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    year: integer("year"),
    mileage: integer("mileage").default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("vehicles_user_id_idx").on(table.userId),
    index("vehicles_plate_idx").on(table.plate),
    uniqueIndex("vehicles_user_plate_uq").on(table.userId, table.plate),
  ]
);

// 4. Tabla Servicios
export const services = pgTable("services", {
  id: uuid("id").defaultRandom().primaryKey(),
  category: serviceCategoryEnum("category").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  basePrice: integer("base_price").default(0).notNull(),
  estimatedDurationMin: integer("estimated_duration_min").default(60).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 5. Tabla Citas / Agendamientos
export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    serviceId: uuid("service_id")
      .references(() => services.id, { onDelete: "restrict" })
      .notNull(),
    // Trabajador (sin cuenta) que hace el servicio, y jefe de área (cuenta) que gestionó la solicitud por última vez.
    workerId: uuid("worker_id").references(() => workers.id, { onDelete: "set null" }),
    managedBy: uuid("managed_by").references(() => users.id, { onDelete: "set null" }),
    scheduledDate: date("scheduled_date").notNull(),
    timeSlot: varchar("time_slot", { length: 10 }).notNull(),
    status: appointmentStatusEnum("status").default("solicitada").notNull(),
    // En una grúa, `location` es el lugar de retiro (origen).
    location: varchar("location", { length: 255 }),
    // Solo servicios de grúa: qué se traslada, destino y datos de la carga (ver utils/cargo.ts).
    cargoType: varchar("cargo_type", { length: 20 }),
    destination: varchar("destination", { length: 255 }),
    cargoDetails: text("cargo_details"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("appointments_user_id_idx").on(table.userId),
    index("appointments_scheduled_date_idx").on(table.scheduledDate),
    index("appointments_status_idx").on(table.status),
  ]
);

// 6. Tabla Bitácora / Hoja de Atención Técnica
export const serviceRecords = pgTable(
  "service_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    appointmentId: uuid("appointment_id")
      .references(() => appointments.id, { onDelete: "cascade" })
      .notNull()
      .unique(),
    workerId: uuid("worker_id")
      .references(() => workers.id, { onDelete: "restrict" })
      .notNull(),
    // Jefe de área (cuenta) que registró el informe.
    authoredBy: uuid("authored_by").references(() => users.id, { onDelete: "set null" }),
    observations: text("observations").notNull(),
    partsReplaced: text("parts_replaced"),
    mileageAtService: integer("mileage_at_service"),
    recommendations: text("recommendations"),
    completedAt: timestamp("completed_at").defaultNow().notNull(),
  },
  (table) => [
    index("service_records_appointment_id_idx").on(table.appointmentId),
    index("service_records_worker_id_idx").on(table.workerId),
  ]
);

// Relaciones Drizzle
export const usersRelations = relations(users, ({ many }) => ({
  vehicles: many(vehicles),
  appointments: many(appointments, { relationName: "userAppointments" }),
  managedAppointments: many(appointments, { relationName: "managedAppointments" }),
  serviceRecords: many(serviceRecords),
}));

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  user: one(users, {
    fields: [vehicles.userId],
    references: [users.id],
  }),
  appointments: many(appointments),
}));

export const servicesRelations = relations(services, ({ many }) => ({
  appointments: many(appointments),
}));

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  user: one(users, {
    fields: [appointments.userId],
    references: [users.id],
    relationName: "userAppointments",
  }),
  worker: one(workers, {
    fields: [appointments.workerId],
    references: [workers.id],
  }),
  manager: one(users, {
    fields: [appointments.managedBy],
    references: [users.id],
    relationName: "managedAppointments",
  }),
  vehicle: one(vehicles, {
    fields: [appointments.vehicleId],
    references: [vehicles.id],
  }),
  service: one(services, {
    fields: [appointments.serviceId],
    references: [services.id],
  }),
  serviceRecord: one(serviceRecords, {
    fields: [appointments.id],
    references: [serviceRecords.appointmentId],
  }),
}));

export const serviceRecordsRelations = relations(serviceRecords, ({ one }) => ({
  appointment: one(appointments, {
    fields: [serviceRecords.appointmentId],
    references: [appointments.id],
  }),
  worker: one(workers, {
    fields: [serviceRecords.workerId],
    references: [workers.id],
  }),
}));

// 7. Tabla Bloqueo de Fechas y Horarios del Taller (T1.9)
export const blockedDates = pgTable(
  "blocked_dates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    date: date("date").notNull(),
    timeSlot: varchar("time_slot", { length: 10 }), // null = día completo bloqueado
    reason: text("reason").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("blocked_dates_date_idx").on(table.date),
    // time_slot nulo = día completo: NULLS NOT DISTINCT evita bloqueos duplicados del mismo día.
    unique("blocked_dates_date_slot_uq").on(table.date, table.timeSlot).nullsNotDistinct(),
  ]
);

export const blockedDatesRelations = relations(blockedDates, ({ one }) => ({
  creator: one(users, {
    fields: [blockedDates.createdBy],
    references: [users.id],
  }),
}));

// 7b. Horarios propios de un día concreto (se suman a DEFAULT_TIME_SLOTS)
export const customTimeSlots = pgTable(
  "custom_time_slots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    date: date("date").notNull(),
    timeSlot: varchar("time_slot", { length: 5 }).notNull(), // HH:MM
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("custom_time_slots_date_idx").on(table.date),
    unique("custom_time_slots_date_slot_uq").on(table.date, table.timeSlot),
  ]
);

// 7c. Contenido editable de la web pública (textos e imágenes). Solo guarda lo que el admin cambió:
// lo demás usa los valores por defecto del frontend. Las claves las define el frontend (app/lib/site-content.ts).
export const siteContent = pgTable("site_content", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 7d. Borrador del contenido: cambios guardados por el admin que aún no se publican. Solo hay filas para las claves
// cuyo borrador difiere de lo publicado; `value` null significa "volver al original" al publicar.
export const siteContentDraft = pgTable("site_content_draft", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value"),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 8. Tabla de Auditoría y Trazabilidad de Operaciones Críticas (T1.10)
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    userEmail: varchar("user_email", { length: 255 }),
    action: varchar("action", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 50 }).notNull(),
    entityId: varchar("entity_id", { length: 100 }),
    details: text("details"),
    ipAddress: varchar("ip_address", { length: 50 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_action_idx").on(table.action),
    index("audit_logs_created_at_idx").on(table.createdAt),
    index("audit_logs_user_id_idx").on(table.userId),
  ]
);

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

// 9. Tabla Catálogo de productos (tienda visual; precios y stock son referenciales, sin pagos)
export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description").default("").notNull(),
    price: integer("price").default(0).notNull(),
    stock: integer("stock").default(0).notNull(),
    category: varchar("category", { length: 100 }).default("GENERAL").notNull(),
    tag: varchar("tag", { length: 100 }),
    art: productArtEnum("art").default("oil").notNull(),
    // URL https o ruta local /images/...; null = arte automático
    image: varchar("image", { length: 500 }),
    featured: boolean("featured").default(false).notNull(),
    active: boolean("active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("products_active_idx").on(table.active), index("products_featured_idx").on(table.featured)]
);

// 10. Tokens de recuperación de contraseña (de un solo uso; solo se guarda el hash SHA-256)
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("password_reset_tokens_user_id_idx").on(table.userId)]
);

// 11. Tokens de confirmación de correo al registrarse (de un solo uso; solo se guarda el hash SHA-256)
export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("email_verification_tokens_user_id_idx").on(table.userId)]
);

// 12. Tokens de sesión revocados al cerrar sesión (el identificador `jti` se descarta cuando el token ya venció)
export const revokedTokens = pgTable(
  "revoked_tokens",
  {
    jti: varchar("jti", { length: 64 }).primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("revoked_tokens_expires_at_idx").on(table.expiresAt)]
);
