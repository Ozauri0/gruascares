"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAgenda } from "./workshop-api";
import type { AgendaItem } from "./workshop-types";

/** Agenda del taller para una fecha: se recarga al cambiar el día y tras cada acción (`reload`). */
export function useAgenda(date: string) {
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetchAgenda(date, controller.signal)
      .then(setAgenda)
      .catch((err) => {
        if ((err as Error)?.name === "AbortError") return;
        setAgenda([]);
        setError(err instanceof Error ? err.message : "No se pudo cargar la agenda del taller.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [date, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { agenda, loading, error, reload };
}
