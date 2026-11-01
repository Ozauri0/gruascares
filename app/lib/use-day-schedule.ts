"use client";

import { useCallback, useEffect, useState } from "react";
import { blockSlot, createSlot, deleteSlot, fetchDaySchedule, unblockDay } from "./admin-api";
import type { DaySlot } from "./admin-types";

/** Horarios de un día del calendario maestro: crear horarios propios y bloquear bloques concretos. */
export function useDaySchedule(date: string | null) {
  const [slots, setSlots] = useState<DaySlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!date) {
      setSlots([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetchDaySchedule(date, controller.signal)
      .then((schedule) => setSlots(schedule.slots))
      .catch((err) => {
        if ((err as Error)?.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "No se pudieron cargar los horarios.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [date, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const add = useCallback(
    async (time: string) => {
      if (!date) return;
      await createSlot(date, time);
      reload();
    },
    [date, reload]
  );
  const removeSlot = useCallback(
    async (id: string) => {
      await deleteSlot(id);
      reload();
    },
    [reload]
  );
  const block = useCallback(
    async (time: string, reason: string) => {
      if (!date) return;
      await blockSlot(date, time, reason);
      reload();
    },
    [date, reload]
  );
  const unblock = useCallback(
    async (blockId: string) => {
      await unblockDay(blockId);
      reload();
    },
    [reload]
  );

  return { slots, loading, error, reload, add, removeSlot, block, unblock };
}
