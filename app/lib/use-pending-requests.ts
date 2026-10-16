"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchPendingRequests } from "./workshop-api";
import type { AgendaItem } from "./workshop-types";

/** Solicitudes por confirmar de todas las fechas; se recarga con `reload` tras confirmar o cancelar. */
export function usePendingRequests() {
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchPendingRequests(controller.signal)
      .then((list) => {
        setItems(list);
        setError("");
      })
      .catch((err) => {
        if ((err as Error)?.name === "AbortError") return;
        setItems([]);
        setError(err instanceof Error ? err.message : "No se pudieron cargar las solicitudes.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { items, loading, error, reload };
}
