import { like, or, inArray, type SQL } from "drizzle-orm";
import { auditLogs } from "../../db/schema.js";

/** Área de trabajo a la que pertenece cada acción registrada (para filtrar y agrupar el registro de actividad). */
export type AuditArea = "taller" | "ventas" | "administracion" | "cuentas" | "clientes" | "sistema";
export type AuditLevel = "info" | "warn" | "error";

export const AUDIT_AREAS: AuditArea[] = ["taller", "ventas", "administracion", "cuentas", "clientes", "sistema"];
export const AUDIT_LEVELS: AuditLevel[] = ["info", "warn", "error"];

type Matcher = { exact?: string[]; prefix?: string[]; suffix?: string[] };

const AREA_MATCHERS: Record<AuditArea, Matcher> = {
  taller: {
    exact: ["APPOINTMENT_STATUS_CHANGE", "APPOINTMENT_FINALIZED", "TECHNICAL_REPORT_SAVED"],
    // trabajadores (personal sin cuenta) que los jefes de taller y de grúas registran y asignan
    prefix: ["WORKER_"],
    // vehículos o citas de un cliente creados, editados o borrados por el personal
    suffix: ["_BY_STAFF"],
  },
  ventas: { prefix: ["CATALOG_"], exact: ["IMAGE_UPLOADED", "WALK_IN_CLIENT_CREATED"] },
  administracion: {
    prefix: ["DATE_", "DATES_", "TIME_SLOT_", "CONTENT_", "DATA_EXPORT_"],
    exact: ["APPOINTMENT_RESCHEDULED", "APPOINTMENT_REASSIGNED", "USER_CREATED", "USER_ROLE_CHANGED", "USER_ACTIVATED", "USER_DEACTIVATED", "USER_UPDATED", "USER_DELETED"],
  },
  cuentas: {
    prefix: ["LOGIN", "PASSWORD_"],
    exact: ["DEMO_LOGIN", "LOGOUT_ALL", "PROFILE_UPDATED", "USER_REGISTER", "EMAIL_VERIFIED", "EMAIL_VERIFICATION_RESENT"],
  },
  clientes: { exact: ["APPOINTMENT_CREATE", "APPOINTMENT_CREATE_GUEST", "APPOINTMENT_CANCEL", "VEHICLE_CREATED", "VEHICLE_UPDATED", "VEHICLE_DELETED"] },
  sistema: { exact: ["SERVER_ERROR", "MAINTENANCE_PURGE"] },
};

const WARN_ACTIONS = new Set(["LOGIN_FAILED", "LOGIN_BLOCKED"]);

function matches(action: string, m: Matcher): boolean {
  return !!m.exact?.includes(action) || !!m.prefix?.some((p) => action.startsWith(p)) || !!m.suffix?.some((x) => action.endsWith(x));
}

export function areaOf(action: string): AuditArea {
  return AUDIT_AREAS.find((a) => matches(action, AREA_MATCHERS[a])) ?? "administracion";
}

export function levelOf(action: string): AuditLevel {
  if (action === "SERVER_ERROR") return "error";
  return WARN_ACTIONS.has(action) ? "warn" : "info";
}

/** Condición SQL equivalente a `areaOf(action) === area`. */
export function areaCondition(area: AuditArea): SQL | undefined {
  const m = AREA_MATCHERS[area];
  return or(...(m.exact ? [inArray(auditLogs.action, m.exact)] : []), ...(m.prefix ?? []).map((p) => like(auditLogs.action, `${p}%`)), ...(m.suffix ?? []).map((x) => like(auditLogs.action, `%${x}`)));
}

export function levelCondition(level: AuditLevel): SQL | undefined {
  if (level === "error") return inArray(auditLogs.action, ["SERVER_ERROR"]);
  if (level === "warn") return inArray(auditLogs.action, [...WARN_ACTIONS]);
  return undefined;
}

const LABELS: Record<string, string> = {
  APPOINTMENT_STATUS_CHANGE: "Cambió el estado de una cita",
  APPOINTMENT_FINALIZED: "Finalizó una atención",
  TECHNICAL_REPORT_SAVED: "Guardó un informe técnico",
  APPOINTMENT_RESCHEDULED: "Reprogramó una cita",
  APPOINTMENT_REASSIGNED: "Reasignó el mecánico de una cita",
  APPOINTMENT_CREATE: "Solicitó una cita",
  APPOINTMENT_CREATE_BY_STAFF: "Agendó una cita para un cliente",
  APPOINTMENT_CREATE_GUEST: "Solicitud de cita de invitado",
  APPOINTMENT_CANCEL: "Canceló una cita",
  WALK_IN_CLIENT_CREATED: "Registró un cliente presencialmente",
  WORKER_CREATED: "Registró un trabajador",
  WORKER_UPDATED: "Editó un trabajador",
  WORKER_ACTIVATED: "Reactivó un trabajador",
  WORKER_DEACTIVATED: "Dio de baja a un trabajador",
  CATALOG_CREATED: "Creó un producto",
  CATALOG_UPDATED: "Editó un producto",
  CATALOG_DELETED: "Eliminó un producto",
  IMAGE_UPLOADED: "Subió una imagen",
  CONTENT_UPDATED: "Editó el contenido de la web",
  CONTENT_DRAFT_SAVED: "Guardó un borrador de la web",
  CONTENT_PUBLISHED: "Publicó cambios de la web",
  CONTENT_DRAFT_DISCARDED: "Descartó el borrador de la web",
  DATE_BLOCKED: "Bloqueó una fecha",
  DATE_UNBLOCKED: "Desbloqueó una fecha",
  DATES_BLOCKED_BULK: "Bloqueó varias fechas",
  DATES_UNBLOCKED_BULK: "Desbloqueó varias fechas",
  TIME_SLOT_CREATED: "Creó un horario extra",
  TIME_SLOT_DELETED: "Eliminó un horario extra",
  USER_CREATED: "Creó una cuenta",
  USER_ROLE_CHANGED: "Cambió los roles de una cuenta",
  USER_ACTIVATED: "Reactivó una cuenta",
  USER_DEACTIVATED: "Desactivó una cuenta",
  USER_UPDATED: "Editó una cuenta",
  USER_DELETED: "Eliminó una cuenta",
  VEHICLE_CREATED: "Registró un vehículo",
  VEHICLE_UPDATED: "Editó un vehículo",
  VEHICLE_DELETED: "Eliminó un vehículo",
  VEHICLE_CREATED_BY_STAFF: "Registró un vehículo de un cliente",
  VEHICLE_UPDATED_BY_STAFF: "Editó un vehículo de un cliente",
  VEHICLE_DELETED_BY_STAFF: "Eliminó un vehículo de un cliente",
  USER_REGISTER: "Se registró una cuenta",
  EMAIL_VERIFIED: "Confirmó su correo",
  EMAIL_VERIFICATION_RESENT: "Pidió un nuevo enlace de confirmación",
  LOGIN: "Inició sesión",
  DEMO_LOGIN: "Inició sesión (demo)",
  LOGIN_FAILED: "Intento de ingreso fallido",
  LOGIN_BLOCKED: "Ingreso bloqueado",
  LOGOUT_ALL: "Cerró todas sus sesiones",
  PROFILE_UPDATED: "Editó su perfil",
  PASSWORD_RESET_REQUESTED: "Pidió recuperar su contraseña",
  PASSWORD_RESET_COMPLETED: "Cambió su contraseña",
  SERVER_ERROR: "Error del servidor",
  MAINTENANCE_PURGE: "Limpieza automática (registros y cuentas sin confirmar)",
};

export function labelOf(action: string): string {
  if (LABELS[action]) return LABELS[action];
  if (action.startsWith("DATA_EXPORT_")) return `Exportó datos (${action.slice("DATA_EXPORT_".length)})`;
  return action;
}
