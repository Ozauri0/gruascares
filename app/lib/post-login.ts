// Ruta a la que volver después de iniciar sesión cuando la persona primero tuvo que crear su cuenta y confirmar
// el correo (el enlace del correo se abre en otra pestaña, por eso se recuerda en localStorage).

const KEY = "gruas-cares-after-login";
/** La ruta recordada vale una hora (el tiempo de crear la cuenta y confirmar el correo). */
const TTL_MS = 60 * 60 * 1000;

/** Solo rutas internas: rechaza "//host", "\\" y cualquier cosa que no empiece con "/". */
export function isSafeInternalPath(path: string | null | undefined): path is string {
  return !!path && path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") && path.length < 300;
}

export function rememberRedirect(path: string): void {
  try {
    if (isSafeInternalPath(path)) window.localStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }));
  } catch {
    // sin almacenamiento: simplemente no se recuerda
  }
}

/** Devuelve la ruta recordada (y la borra), o null. */
export function takeRememberedRedirect(): string | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    window.localStorage.removeItem(KEY);
    const saved = raw ? (JSON.parse(raw) as { path?: string; at?: number }) : null;
    return saved && typeof saved.at === "number" && Date.now() - saved.at < TTL_MS && isSafeInternalPath(saved.path) ? saved.path : null;
  } catch {
    return null;
  }
}
