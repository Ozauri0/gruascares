// Cookie de apariencia `gc_session` (valor = rol). TEMPORAL: solo la lee `proxy.ts` para redirigir
// por rol hasta que el proxy verifique el JWT real (issue #51). No concede ningún acceso a datos:
// toda autorización la decide el backend con la cookie httpOnly `gc_token`.

import type { UserRole } from "./portal-types";

const SESSION_COOKIE = "gc_session";
const MAX_AGE = 7 * 24 * 60 * 60;

export function setSessionHint(role: UserRole): void {
  document.cookie = `${SESSION_COOKIE}=${role}; path=/; max-age=${MAX_AGE}; samesite=lax`;
}

export function clearSessionHint(): void {
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
