// Cliente HTTP del frontend hacia el backend.
// Todas las rutas son relativas a este mismo origen (`/api/...`): Next las reenvía al backend
// (ver `rewrites` en next.config.ts), así la cookie httpOnly `gc_token` viaja sin configuración de CORS.

import type { ApiErrorBody } from "./api-types";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

export type ApiOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
  /** Si es true (por defecto) un 401 lleva a /login conservando la ruta actual. */
  redirectOnUnauthorized?: boolean;
};

const DEFAULT_MESSAGES: Record<number, string> = {
  400: "Revisa los datos ingresados.",
  401: "Tu sesión expiró. Inicia sesión nuevamente.",
  403: "No tienes permiso para realizar esta acción.",
  404: "No encontramos lo que buscas.",
  409: "La operación entra en conflicto con el estado actual.",
  429: "Hiciste demasiadas solicitudes. Espera un momento e inténtalo de nuevo.",
};

const AUTH_PAGES = ["/login", "/registro"];

function buildUrl(path: string, query?: Query): string {
  if (!path.startsWith("/api/")) throw new Error(`Ruta de API inválida: ${path} (debe empezar con /api/)`);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  const { pathname, search } = window.location;
  if (AUTH_PAGES.some((page) => pathname.startsWith(page))) return;
  window.location.assign(`/login?redirect=${encodeURIComponent(pathname + search)}`);
}

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, query, signal, redirectOnUnauthorized = true } = options;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const url = buildUrl(path, query); // fuera del try: una ruta inválida es un error de programación, no de red

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      credentials: "include",
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    throw new ApiError(0, "NetworkError", "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.");
  }

  if (response.status === 204) return undefined as T;

  let data: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const errorBody = (data ?? {}) as Partial<ApiErrorBody>;
    if (response.status === 401 && redirectOnUnauthorized) redirectToLogin();
    throw new ApiError(
      response.status,
      errorBody.error ?? `HTTP ${response.status}`,
      errorBody.message ?? DEFAULT_MESSAGES[response.status] ?? "Ocurrió un error inesperado. Inténtalo más tarde."
    );
  }

  return data as T;
}

export const apiGet = <T>(path: string, query?: Query, options: Omit<ApiOptions, "method" | "query" | "body"> = {}) =>
  api<T>(path, { ...options, method: "GET", query });
export const apiPost = <T>(path: string, body?: unknown, options: Omit<ApiOptions, "method" | "body"> = {}) =>
  api<T>(path, { ...options, method: "POST", body });
export const apiPatch = <T>(path: string, body?: unknown, options: Omit<ApiOptions, "method" | "body"> = {}) =>
  api<T>(path, { ...options, method: "PATCH", body });
export const apiDelete = <T>(path: string, options: Omit<ApiOptions, "method" | "body"> = {}) =>
  api<T>(path, { ...options, method: "DELETE" });
