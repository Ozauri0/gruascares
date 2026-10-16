"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { demoLoginRequest, fetchSession, loginRequest, logoutRequest, registerRequest, type RegisterInput } from "./auth-api";
import type { SessionUser, UserRole } from "./portal-types";
import { HOME_FOR_ROLE } from "./route-guard";

export { HOME_FOR_ROLE };

/** ¿Tiene alguno de estos roles (principal o adicional)? */
export function userHasRole(user: SessionUser | null | undefined, ...allowed: UserRole[]): boolean {
  return !!user && [user.role, ...(user.roles ?? [])].some((r) => allowed.includes(r));
}

// Sesión del frontend conectada al backend (issue #50).
// - La sesión real es la cookie httpOnly `gc_token`; el estado `user` se obtiene de GET /api/auth/me.
// - Acceso demo sin credenciales: loginAs(role) → POST /api/auth/demo-login (solo con DEMO_MODE en el backend).
// - login/register usan las rutas reales. Los errores llegan como `ApiError` con mensaje en español.

type AuthContextValue = {
  user: SessionUser | null;
  loading: boolean;
  /** Entra como la cuenta demo del rol (sin credenciales). */
  loginAs: (role: UserRole) => Promise<SessionUser>;
  login: (email: string, password: string) => Promise<SessionUser>;
  /** Crea la cuenta pendiente de confirmar (no inicia sesión). */
  register: (input: RegisterInput) => Promise<{ email: string }>;
  logout: () => Promise<void>;
};

const unavailable = async (): Promise<never> => {
  throw new Error("AuthProvider no está montado");
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  loginAs: unavailable,
  login: unavailable,
  register: unavailable,
  logout: unavailable,
});

const SESSION_HINT_KEY = "gruas-cares-session-hint";

/** Último usuario conocido, solo para pintar el nombre y los menús al instante; la sesión real se confirma con el backend. */
function readHint(): SessionUser | null {
  try {
    const raw = localStorage.getItem(SESSION_HINT_KEY);
    const parsed = raw ? (JSON.parse(raw) as SessionUser) : null;
    return parsed && typeof parsed.name === "string" && typeof parsed.role === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function writeHint(user: SessionUser | null) {
  try {
    if (user) localStorage.setItem(SESSION_HINT_KEY, JSON.stringify(user));
    else localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    // sin almacenamiento disponible: solo se pierde la carga instantánea
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const establish = useCallback((next: SessionUser) => {
    writeHint(next);
    setUser(next);
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const hint = readHint();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- se lee localStorage tras hidratar para no desajustar el HTML del servidor
    if (hint) setUser(hint);
    fetchSession()
      .then((session) => {
        if (cancelled) return;
        writeHint(session);
        setUser(session);
      })
      .catch(() => {
        // Backend inaccesible: no se asume sesión; las pantallas muestran su propio error al pedir datos.
        if (!cancelled) {
          writeHint(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loginAs = useCallback(async (role: UserRole) => establish(await demoLoginRequest(role)), [establish]);
  const login = useCallback(async (email: string, password: string) => establish(await loginRequest(email, password)), [establish]);
  const register = useCallback((input: RegisterInput) => registerRequest(input), []);
  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      writeHint(null);
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ user, loading, loginAs, login, register, logout }), [user, loading, loginAs, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

/** Primer nombre para mostrar en el menú ("Christian Ferrer" → "Christian"). */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
