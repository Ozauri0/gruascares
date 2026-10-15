"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAvailability } from "./appointments-api";
import type { SlotAvailability } from "./availability";

/** Bloques horarios reales de una fecha (se recargan al cambiar la fecha y se cancelan si cambia antes de responder). */
export function useAvailability(date: string) {
  const [slots, setSlots] = useState<SlotAvailability[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!date) {
      setSlots([]);
      setError("");
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetchAvailability(date, controller.signal)
      .then((result) => setSlots(result))
      .catch((err) => {
        if ((err as Error)?.name === "AbortError") return;
        setSlots([]);
        setError(err instanceof Error ? err.message : "No se pudo consultar la disponibilidad.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [date, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { slots, loading, error, refresh };
}
