// Usuarios y personal contra el backend (GET/POST/PATCH /api/admin/users; solo admin).

import { apiGet, apiPatch, apiPost } from "./api";
import { toAdminUser } from "./api-adapters";
import type { ApiAdminUser } from "./api-types";
import type { SessionUser, UserRole } from "./portal-types";

export type UserListQuery = { q?: string; role?: UserRole | "todos"; page?: number };
export type UserPage = { users: SessionUser[]; total: number; page: number; limit: number };

export async function listUsers(query: UserListQuery, signal?: AbortSignal): Promise<UserPage> {
  const data = await apiGet<{ users: ApiAdminUser[]; total: number; page: number; limit: number }>(
    "/api/admin/users",
    { q: query.q?.trim(), role: query.role && query.role !== "todos" ? query.role : undefined, page: query.page, limit: 50 },
    { signal }
  );
  return { users: data.users.map(toAdminUser), total: data.total, page: data.page, limit: data.limit };
}

export type NewStaff = { name: string; email: string; phone: string; roles: ("mecanico" | "vendedor" | "admin")[]; password: string };

export async function createStaff(input: NewStaff): Promise<SessionUser> {
  const { user } = await apiPost<{ user: ApiAdminUser }>("/api/admin/users", { ...input, phone: input.phone.trim() || undefined });
  return toAdminUser(user);
}

/** Cambia los roles de un usuario (el primero es el principal). Rige de inmediato (no cierra su sesión). */
export async function setUserRoles(id: string, roles: UserRole[]): Promise<SessionUser> {
  const { user } = await apiPatch<{ user: ApiAdminUser }>(`/api/admin/users/${encodeURIComponent(id)}`, { roles });
  return toAdminUser(user);
}

export async function setUserActive(id: string, isActive: boolean): Promise<SessionUser> {
  const { user } = await apiPatch<{ user: ApiAdminUser }>(`/api/admin/users/${encodeURIComponent(id)}`, { isActive });
  return toAdminUser(user);
}
