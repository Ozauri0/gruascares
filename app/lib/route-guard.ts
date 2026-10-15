// Protección de rutas por rol (issue #51). Lógica pura y sin dependencias de Next para poder probarla.
//
// El proxy NO decide qué datos ve cada rol (eso lo hace el backend en cada /api/*): solo evita mostrar
// pantallas de un rol a quien no corresponde. Para saber el rol consulta GET /api/auth/me con la cookie
// httpOnly `gc_token`: así respeta al instante desactivaciones y cambios de rol, y el frontend no necesita
// conocer JWT_SECRET.

export type Role = "admin" | "mecanico" | "usuario";

export const HOME_FOR_ROLE: Record<Role, string> = {
  usuario: "/portal",
  mecanico: "/mecanico",
  admin: "/admin",
};

export function isRole(value: unknown): value is Role {
  return value === "admin" || value === "mecanico" || value === "usuario";
}

export type GuardDecision = { type: "allow" } | { type: "login" } | { type: "redirect"; to: string };

/** /admin → solo admin; /mecanico → mecánico o admin; /portal → cualquier sesión. */
export function guardDecision(pathname: string, role: Role | null): GuardDecision {
  if (!role) return { type: "login" };
  const isUnder = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  if (isUnder("/admin") && role !== "admin") return { type: "redirect", to: HOME_FOR_ROLE[role] };
  if (isUnder("/mecanico") && role !== "mecanico" && role !== "admin") return { type: "redirect", to: HOME_FOR_ROLE[role] };
  return { type: "allow" };
}

/** Rol de la sesión según el backend, o null (sin cookie, sesión inválida/revocada o backend inaccesible). */
export async function fetchSessionRole(
  token: string | undefined,
  backendUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<Role | null> {
  if (!token) return null;
  try {
    const response = await fetchImpl(`${backendUrl}/api/auth/me`, {
      headers: { cookie: `gc_token=${token}`, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { user?: { role?: unknown } };
    return isRole(data.user?.role) ? data.user.role : null;
  } catch {
    return null; // sin poder verificar la sesión se asume que no hay (falla cerrado)
  }
}
