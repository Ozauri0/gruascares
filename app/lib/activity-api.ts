// Registro de actividad (GET /api/admin/audit-logs; solo admin).

import { apiGet } from "./api";

export type ActivityArea = "taller" | "ventas" | "administracion" | "cuentas" | "clientes" | "sistema";
export type ActivityLevel = "info" | "warn" | "error";

export type ActivityEntry = {
  id: string;
  createdAt: string;
  action: string;
  label: string;
  area: ActivityArea;
  level: ActivityLevel;
  userName: string | null;
  userEmail: string | null;
  userRoles: string[];
  entityType: string;
  entityId: string | null;
  details: string | null;
  ipAddress: string | null;
};

export type ActivityQuery = { area?: ActivityArea | "todas"; level?: ActivityLevel | "todos"; q?: string; startDate?: string; endDate?: string; page?: number };
export type ActivityPage = { logs: ActivityEntry[]; total: number; page: number; limit: number };

export async function listActivity(query: ActivityQuery, signal?: AbortSignal): Promise<ActivityPage> {
  return apiGet<ActivityPage>(
    "/api/admin/audit-logs",
    {
      area: query.area && query.area !== "todas" ? query.area : undefined,
      level: query.level && query.level !== "todos" ? query.level : undefined,
      q: query.q?.trim() || undefined,
      startDate: query.startDate || undefined,
      endDate: query.endDate || undefined,
      page: query.page,
      limit: 50,
    },
    { signal }
  );
}

const DETAIL_LABELS: Record<string, string> = {
  from: "de", to: "a", email: "correo", name: "producto", fields: "campos", keys: "claves", status: "código", method: "método", path: "ruta",
  message: "mensaje", role: "rol", roles: "roles", newRoles: "roles nuevos", previousRoles: "roles anteriores", newActive: "activo", bytes: "bytes",
};

/** Resume el JSON de detalles en una línea legible ("de: pendiente · a: confirmada"). */
export function formatDetails(raw: string | null): string {
  if (!raw) return "";
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return String(data);
  return Object.entries(data as Record<string, unknown>)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${DETAIL_LABELS[key] ?? key}: ${Array.isArray(value) ? value.join(", ") : typeof value === "object" ? JSON.stringify(value) : String(value)}`)
    .join(" · ");
}
