import { pgTable, uuid, varchar, text, integer, boolean, timestamp, date, pgEnum, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// 1. Enums
export const userRoleEnum = pgEnum("user_role", ["admin", "mecanico", "usuario"]);
export const serviceCategoryEnum = pgEnum("service_category", ["grua", "serviteca"]);
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
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").default("usuario").notNull(),
  phone: varchar("phone", { length: 50 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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
    mechanicId: uuid("mechanic_id").references(() => users.id, { onDelete: "set null" }),
    scheduledDate: date("scheduled_date").notNull(),
    timeSlot: varchar("time_slot", { length: 10 }).notNull(),
    status: appointmentStatusEnum("status").default("solicitada").notNull(),
    location: varchar("location", { length: 255 }),
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
    mechanicId: uuid("mechanic_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    observations: text("observations").notNull(),
    partsReplaced: text("parts_replaced"),
    mileageAtService: integer("mileage_at_service"),
    recommendations: text("recommendations"),
    completedAt: timestamp("completed_at").defaultNow().notNull(),
  },
  (table) => [
    index("service_records_appointment_id_idx").on(table.appointmentId),
    index("service_records_mechanic_id_idx").on(table.mechanicId),
  ]
);

// Relaciones Drizzle
export const usersRelations = relations(users, ({ many }) => ({
  vehicles: many(vehicles),
  appointments: many(appointments, { relationName: "userAppointments" }),
  assignedAppointments: many(appointments, { relationName: "mechanicAppointments" }),
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
  mechanic: one(users, {
    fields: [appointments.mechanicId],
    references: [users.id],
    relationName: "mechanicAppointments",
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
  mechanic: one(users, {
    fields: [serviceRecords.mechanicId],
    references: [users.id],
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
  ]
);

export const blockedDatesRelations = relations(blockedDates, ({ one }) => ({
  creator: one(users, {
    fields: [blockedDates.createdBy],
    references: [users.id],
  }),
}));

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

