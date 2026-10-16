// Operaciones de sesión contra el backend (ver backend/src/controllers/auth.controller.ts).
// La sesión vive en la cookie httpOnly `gc_token`: aquí nunca se lee ni se guarda ningún token.

import { api, apiGet, apiPost, ApiError } from "./api";
import { toSessionUser } from "./api-adapters";
import type { ApiUser } from "./api-types";
import type { SessionUser, UserRole } from "./portal-types";

type UserResponse = { user: ApiUser };

/** Sesión actual, o null si no hay sesión (401). Otros errores (red, 5xx) sí se propagan. */
export async function fetchSession(): Promise<SessionUser | null> {
  try {
    const { user } = await apiGet<UserResponse>("/api/auth/me", undefined, { redirectOnUnauthorized: false });
    return toSessionUser(user);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function loginRequest(email: string, password: string): Promise<SessionUser> {
  const { user } = await api<UserResponse>("/api/auth/login", {
    method: "POST",
    body: { email, password },
    redirectOnUnauthorized: false, // un 401 aquí significa "credenciales inválidas", no "sesión vencida"
  });
  return toSessionUser(user);
}

export type RegisterInput = { name: string; email: string; password: string; phone?: string };

/** El registro no abre sesión: la cuenta queda pendiente hasta confirmar el enlace que llega al correo. */
export async function registerRequest(input: RegisterInput): Promise<{ email: string }> {
  const body = { ...input, phone: input.phone?.trim() || undefined };
  const { user } = await apiPost<UserResponse>("/api/auth/register", body, { redirectOnUnauthorized: false });
  return { email: user.email };
}

/** Confirma el correo con el token del enlace recibido. */
export async function verifyEmailRequest(token: string): Promise<string> {
  const { message } = await apiPost<{ message: string }>("/api/auth/verify-email", { token }, { redirectOnUnauthorized: false });
  return message;
}

/** Pide un enlace nuevo (la respuesta es la misma exista o no la cuenta). */
export async function resendVerificationRequest(email: string): Promise<string> {
  const { message } = await apiPost<{ message: string }>("/api/auth/resend-verification", { email }, { redirectOnUnauthorized: false });
  return message;
}

/** SOLO DEMO: entra como la cuenta demo del rol, sin credenciales (requiere DEMO_MODE en el backend). */
export async function demoLoginRequest(role: UserRole): Promise<SessionUser> {
  try {
    const { user } = await api<UserResponse>("/api/auth/demo-login", {
      method: "POST",
      body: { role },
      redirectOnUnauthorized: false,
    });
    return toSessionUser(user);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new ApiError(404, "DemoDisabled", "El acceso demo no está habilitado en el servidor (DEMO_MODE).");
    }
    throw error;
  }
}

export async function logoutRequest(): Promise<void> {
  await api("/api/auth/logout", { method: "POST", redirectOnUnauthorized: false });
}
