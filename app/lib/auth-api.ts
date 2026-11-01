// Operaciones de sesión contra el backend (ver backend/src/controllers/auth.controller.ts).
// La sesión vive en la cookie httpOnly `gc_token`: aquí nunca se lee ni se guarda ningún token.

import { api, apiGet, apiPatch, apiPost, ApiError } from "./api";
import { toSessionUser } from "./api-adapters";
import type { ApiUser } from "./api-types";
import type { SessionUser, UserRole } from "./portal-types";
import { normalizeRut } from "./rut";

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

export type RegisterInput = { name: string; rut: string; email: string; phone: string; password: string };

/** El registro no abre sesión: la cuenta queda pendiente hasta confirmar el enlace que llega al correo. */
export async function registerRequest(input: RegisterInput): Promise<{ email: string }> {
  const body = {
    name: input.name,
    rut: normalizeRut(input.rut),
    email: input.email,
    phone: input.phone.trim(),
    password: input.password,
  };
  const { user } = await apiPost<UserResponse>("/api/auth/register", body, { redirectOnUnauthorized: false });
  return { email: user.email ?? input.email };
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

/** ¿El servidor tiene el login rápido (DEMO_MODE)? Si no responde, se asume que no: los botones no se muestran. */
export async function demoEnabledRequest(): Promise<boolean> {
  try {
    const { enabled } = await apiGet<{ enabled: boolean }>("/api/auth/demo-status", undefined, { redirectOnUnauthorized: false });
    return enabled === true;
  } catch {
    return false;
  }
}

export async function logoutRequest(): Promise<void> {
  await api("/api/auth/logout", { method: "POST", redirectOnUnauthorized: false });
}

/** Pide el enlace para restablecer la contraseña. La respuesta es la misma exista o no el correo. */
export async function forgotPasswordRequest(email: string): Promise<string> {
  const { message } = await apiPost<{ message: string }>("/api/auth/forgot-password", { email }, { redirectOnUnauthorized: false });
  return message;
}

/** Cambia la contraseña con el token del enlace del correo (un solo uso; cierra las sesiones de la cuenta). */
export async function resetPasswordRequest(token: string, password: string): Promise<string> {
  const { message } = await apiPost<{ message: string }>("/api/auth/reset-password", { token, password }, { redirectOnUnauthorized: false });
  return message;
}

/** Edita nombre y teléfono propios; el correo, el RUT y el rol no se cambian desde aquí. */
export async function updateProfileRequest(input: { name: string; phone: string }): Promise<SessionUser> {
  const { user } = await apiPatch<UserResponse>("/api/auth/me", { name: input.name.trim(), phone: input.phone.trim() });
  return toSessionUser(user);
}

/** Cierra la sesión en todos los dispositivos (también en este: el backend borra la cookie). */
export async function logoutAllRequest(): Promise<void> {
  await apiPost("/api/auth/logout-all");
}

/** Cambia la contraseña desde el perfil (pide la actual; cierra las otras sesiones y mantiene esta). */
export async function changePasswordRequest(currentPassword: string, newPassword: string): Promise<string> {
  const { message } = await apiPost<{ message: string }>("/api/auth/change-password", { currentPassword, newPassword }, { redirectOnUnauthorized: false });
  return message;
}

/** Misma regla que el backend: mínimo 8 caracteres y máximo 72 bytes (límite de bcrypt). */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
  if (new TextEncoder().encode(password).length > 72) return "La contraseña es demasiado larga (máximo 72 bytes, unos 72 caracteres).";
  return null;
}
