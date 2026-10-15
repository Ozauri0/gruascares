"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { demoLoginRequest, fetchSession, loginRequest, logoutRequest, registerRequest, type RegisterInput } from "./auth-api";
import type { SessionUser, UserRole } from "./portal-types";
import { HOME_FOR_ROLE } from "./route-guard";

export { HOME_FOR_ROLE };

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
  register: (input: RegisterInput) => Promise<SessionUser>;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const establish = useCallback((next: SessionUser) => {
    setUser(next);
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchSession()
      .then((session) => {
        if (cancelled) return;
        setUser(session);
      })
      .catch(() => {
        // Backend inaccesible: no se asume sesión; las pantallas muestran su propio error al pedir datos.
        if (!cancelled) setUser(null);
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
  const register = useCallback(async (input: RegisterInput) => establish(await registerRequest(input)), [establish]);
  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ user, loading, loginAs, login, register, logout }), [user, loading, loginAs, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
