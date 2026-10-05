"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { MOCK_USER } from "./portal-mocks";
import type { SessionUser, UserRole } from "./portal-types";

// Sesión demostrativa del frontend (T2.2).
// Contrato real (backend T1.3, ya mergeado):
// - POST /api/auth/login { email, password } -> { user, token } + cookie httpOnly `gc_token`
// - POST /api/auth/register { name, email, password, phone } -> { user, token }
// - GET /api/auth/me -> { user } | 401
// - POST /api/auth/logout -> 200
// Para no depender del backend corriendo, el provider usa sesión mock con la
// misma forma de `user` y expone login/logout con igual firma; al conectar la
// API solo cambia el interior de estas funciones.

const SESSION_COOKIE = "gc_session";
const MAX_AGE = 7 * 24 * 60 * 60;

export const HOME_FOR_ROLE: Record<UserRole, string> = {
  usuario: "/portal",
  mecanico: "/mecanico",
  admin: "/admin",
};

const DEMO_USERS: Record<UserRole, SessionUser> = {
  usuario: MOCK_USER,
  mecanico: {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Juan Paredes",
    email: "mecanico@gruascares.cl",
    role: "mecanico",
    phone: "+56 9 6832 7329",
    isActive: true,
    createdAt: "2025-06-10T12:00:00.000Z",
  },
  admin: {
    id: "00000000-0000-4000-8000-000000000003",
    name: "Carlos Cares",
    email: "admin@gruascares.cl",
    role: "admin",
    phone: "+56 9 9162 7809",
    isActive: true,
    createdAt: "2025-03-02T12:00:00.000Z",
  },
};

type AuthContextValue = {
  user: SessionUser | null;
  loading: boolean;
  loginAs: (role: UserRole) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  loginAs: () => {},
  logout: () => {},
});

function readRoleCookie(): UserRole | null {
  const found = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  return found === "admin" || found === "mecanico" || found === "usuario" ? found : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const role = readRoleCookie();
    if (role) setUser(DEMO_USERS[role]);
    setLoading(false);
  }, []);

  const loginAs = useCallback((role: UserRole) => {
    document.cookie = `${SESSION_COOKIE}=${role}; path=/; max-age=${MAX_AGE}; samesite=lax`;
    setUser(DEMO_USERS[role]);
  }, []);

  const logout = useCallback(() => {
    document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0; samesite=lax`;
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, loginAs, logout }), [user, loading, loginAs, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
