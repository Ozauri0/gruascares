export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "gruas-cares-theme";

/** Valida el valor guardado en localStorage (`"light"` o `"dark"`). */
export function parseStoredTheme(raw: string | null | undefined): ThemeMode | null {
  if (raw === "light" || raw === "dark") return raw;
  return null;
}

/** Resuelve el tema activo a partir de la preferencia guardada y `prefers-color-scheme`. */
export function resolveTheme(stored: string | null | undefined, prefersDark: boolean): ThemeMode {
  const parsed = parseStoredTheme(stored);
  if (parsed) return parsed;
  return prefersDark ? "dark" : "light";
}

/** Alterna entre modo claro y modo noche. */
export function nextTheme(current: ThemeMode): ThemeMode {
  return current === "dark" ? "light" : "dark";
}

/**
 * Script inline que se ejecuta en `<head>` antes del primer pintado para fijar
 * `document.documentElement.dataset.theme` sin parpadeo (FOUC).
 */
export const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');var d=s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){}})();`;
