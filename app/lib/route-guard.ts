// Protección de rutas por rol (issue #51). Lógica pura y sin dependencias de Next para poder probarla.
//
// El proxy NO decide qué datos ve cada rol (eso lo hace el backend en cada /api/*): solo evita mostrar
// pantallas de un rol a quien no corresponde. Para saber el rol consulta GET /api/auth/me con la cookie
// httpOnly `gc_token`: así respeta al instante desactivaciones y cambios de rol, y el frontend no necesita
// conocer JWT_SECRET.

export type Role = "admin" | "mecanico" | "usuario" | "vendedor";

export const HOME_FOR_ROLE: Record<Role, string> = {
  usuario: "/portal",
  mecanico: "/mecanico",
  admin: "/admin",
  vendedor: "/vendedor",
};

export function isRole(value: unknown): value is Role {
  return value === "admin" || value === "mecanico" || value === "usuario" || value === "vendedor";
}

export type GuardDecision = { type: "allow" } | { type: "login" } | { type: "redirect"; to: string };

/** Nombre del área a la que lleva cada rol (menú de quien tiene más de un rol). */
export const AREA_LABEL: Record<Role, string> = {
  usuario: "Mi cuenta",
  mecanico: "Taller",
  vendedor: "Ventas",
  admin: "Administración",
};

/** Roles de un usuario: el principal (su inicio) primero, luego los adicionales. */
export function rolesOf(user: { role: Role; roles?: Role[] }): Role[] {
  return [...new Set([user.role, ...(user.roles ?? [])])];
}

/** Áreas a las que puede entrar: el portal de cliente es de todos (el personal también trae su auto); admin entra a todas. */
export function areasFor(user: { role: Role; roles?: Role[] }): Role[] {
  const mine = rolesOf(user);
  const has = (...r: Role[]) => mine.some((x) => r.includes(x));
  const areas: Role[] = [];
  if (has("admin")) areas.push("admin");
  if (has("mecanico", "admin")) areas.push("mecanico");
  if (has("vendedor", "admin")) areas.push("vendedor");
  areas.push("usuario");
  return areas;
}

export type Session = { role: Role; roles: Role[] };

/**
 * /admin → solo admin; /mecanico → mecánico o admin; /vendedor → vendedor o admin;
 * /atencion-presencial → mecánico, vendedor o admin; /portal → cualquier sesión.
 * Con varios roles basta con tener uno de los permitidos; si no, vuelve al inicio del rol principal.
 */
export function guardDecision(pathname: string, role: Role | null, roles?: Role[]): GuardDecision {
  if (!role) return { type: "login" };
  const mine = rolesOf({ role, roles });
  const has = (...allowed: Role[]) => mine.some((r) => allowed.includes(r));
  const isUnder = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  const deny = { type: "redirect", to: HOME_FOR_ROLE[role] } as const;
  if (isUnder("/admin") && !has("admin")) return deny;
  if (isUnder("/mecanico") && !has("mecanico", "admin")) return deny;
  if (isUnder("/vendedor") && !has("vendedor", "admin")) return deny;
  if (isUnder("/atencion-presencial") && !has("mecanico", "vendedor", "admin")) return deny;
  return { type: "allow" };
}

/** Rol y roles de la sesión según el backend, o null (sin cookie, sesión inválida/revocada o backend inaccesible). */
export async function fetchSession(
  token: string | undefined,
  backendUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<Session | null> {
  if (!token) return null;
  try {
    const response = await fetchImpl(`${backendUrl}/api/auth/me`, {
      headers: { cookie: `gc_token=${token}`, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { user?: { role?: unknown; roles?: unknown } };
    if (!isRole(data.user?.role)) return null;
    const roles = Array.isArray(data.user.roles) ? data.user.roles.filter(isRole) : [];
    return { role: data.user.role, roles: rolesOf({ role: data.user.role, roles }) };
  } catch {
    return null; // sin poder verificar la sesión se asume que no hay (falla cerrado)
  }
}

/** Solo el rol principal de la sesión (ver `fetchSession`). */
export async function fetchSessionRole(token: string | undefined, backendUrl: string, fetchImpl: typeof fetch = fetch): Promise<Role | null> {
  return (await fetchSession(token, backendUrl, fetchImpl))?.role ?? null;
}
