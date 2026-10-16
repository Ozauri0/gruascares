"use client";

import { useCallback, useEffect, useState } from "react";
import { listActivity, type ActivityEntry, type ActivityQuery } from "./activity-api";

/** Registro de actividad con filtros (la búsqueda espera un instante al escribir) y "ver más". */
export function useActivity(filters: Omit<ActivityQuery, "page">) {
  const { area, level, q, startDate, endDate } = filters;
  const [logs, setLogs] = useState<ActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      listActivity({ area, level, q, startDate, endDate, page: 1 }, controller.signal)
        .then((result) => {
          setLogs(result.logs);
          setTotal(result.total);
          setPage(1);
        })
        .catch((err) => {
          if ((err as Error)?.name === "AbortError") return;
          setLogs([]);
          setTotal(0);
          setError(err instanceof Error ? err.message : "No se pudo cargar el registro.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, q ? 300 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [area, level, q, startDate, endDate, nonce]);

  const loadMore = useCallback(async () => {
    const result = await listActivity({ area, level, q, startDate, endDate, page: page + 1 });
    setLogs((current) => [...current, ...result.logs.filter((l) => !current.some((c) => c.id === l.id))]);
    setTotal(result.total);
    setPage(result.page);
  }, [area, level, q, startDate, endDate, page]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { logs, total, loading, error, hasMore: logs.length < total, loadMore, reload };
}
