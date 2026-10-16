"use client";

import { useCallback, useEffect, useState } from "react";
import type { SessionUser, UserRole } from "./portal-types";
import { createStaff, listUsers, setUserActive, setUserRoles, type NewStaff } from "./users-api";

/** Directorio de usuarios con búsqueda (con espera al escribir), filtro por rol y "ver más". */
export function useUsers(search: string, role: UserRole | "todos") {
  const [users, setUsers] = useState<SessionUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);

  // Búsqueda y filtro: vuelven a la primera página tras una breve espera.
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      listUsers({ q: search, role, page: 1 }, controller.signal)
        .then((result) => {
          setUsers(result.users);
          setTotal(result.total);
          setPage(1);
        })
        .catch((err) => {
          if ((err as Error)?.name === "AbortError") return;
          setUsers([]);
          setTotal(0);
          setError(err instanceof Error ? err.message : "No se pudieron cargar los usuarios.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, search ? 300 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, role, nonce]);

  const loadMore = useCallback(async () => {
    const result = await listUsers({ q: search, role, page: page + 1 });
    setUsers((current) => [...current, ...result.users.filter((u) => !current.some((c) => c.id === u.id))]);
    setTotal(result.total);
    setPage(result.page);
  }, [search, role, page]);

  const add = useCallback(async (input: NewStaff) => {
    await createStaff(input);
    setNonce((n) => n + 1); // recarga: el nuevo miembro puede no coincidir con el filtro actual
  }, []);

  const toggleActive = useCallback(async (id: string, isActive: boolean) => {
    const updated = await setUserActive(id, isActive);
    setUsers((current) => current.map((user) => (user.id === id ? updated : user)));
  }, []);

  const changeRoles = useCallback(async (id: string, roles: UserRole[]) => {
    const updated = await setUserRoles(id, roles);
    setUsers((current) => current.map((user) => (user.id === id ? updated : user)));
  }, []);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { users, total, loading, error, reload, loadMore, add, toggleActive, changeRoles, hasMore: users.length < total };
}
