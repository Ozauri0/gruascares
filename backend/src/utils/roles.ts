import type { UserRole } from "../types/auth.js";

type WithRoles = { role: UserRole; extraRoles?: UserRole[] | null; roles?: UserRole[] | null };

/** Todos los roles de un usuario: el principal (define su página de inicio) y los adicionales. */
export function rolesOf(user: WithRoles): UserRole[] {
  const all = user.roles?.length ? user.roles : [user.role, ...(user.extraRoles ?? [])];
  return [...new Set(all)];
}

/** ¿Tiene al menos uno de estos roles? */
export function hasRole(user: WithRoles | undefined, ...allowed: UserRole[]): boolean {
  return !!user && rolesOf(user).some((r) => allowed.includes(r));
}

/** Usuario listo para responder al cliente: agrega `roles` y quita `extraRoles`. */
export function withRoles<T extends { role: UserRole; extraRoles: UserRole[] }>(row: T): Omit<T, "extraRoles"> & { roles: UserRole[] } {
  const { extraRoles, ...rest } = row;
  return { ...rest, roles: rolesOf(row) };
}
