"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { assignWorker, blockDay, rescheduleAppointment, fetchAgendaRange, listBlockedDays, unblockDay } from "./admin-api";
import { listWorkers, type Worker } from "./workers-api";
import type { BlockedDay } from "./admin-types";
import type { AgendaItem } from "./workshop-types";

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDay = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`;

/** Citas del mes, días bloqueados y personal de taller para el calendario maestro. */
export function useCalendar(year: number, month: number) {
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [blocked, setBlocked] = useState<BlockedDay[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const last = new Date(year, month + 1, 0).getDate();
    setLoading(true);
    setError("");
    Promise.all([
      fetchAgendaRange(isoDay(year, month, 1), isoDay(year, month, last), controller.signal),
      listBlockedDays(controller.signal),
      listWorkers(controller.signal, undefined, true),
    ])
      .then(([agenda, days, people]) => {
        setItems(agenda);
        setBlocked(days);
        setWorkers(people);
      })
      .catch((err) => {
        if ((err as Error)?.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "No se pudo cargar el calendario.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [year, month, nonce]);

  const byDay = useMemo(() => {
    const map: Record<string, AgendaItem[]> = {};
    for (const item of items) (map[item.date] ??= []).push(item);
    for (const list of Object.values(map)) list.sort((a, b) => a.timeSlot.localeCompare(b.timeSlot));
    return map;
  }, [items]);

  const block = useCallback(async (date: string, reason: string) => {
    const created = await blockDay(date, reason);
    setBlocked((current) => [...current.filter((b) => b.date !== date), created]);
  }, []);

  const unblock = useCallback(async (id: string) => {
    await unblockDay(id);
    setBlocked((current) => current.filter((b) => b.id !== id));
  }, []);

  const assign = useCallback(
    async (appointmentId: string, workerId: string) => {
      await assignWorker(appointmentId, workerId);
      const name = workers.find((w) => w.id === workerId)?.name ?? null;
      setItems((current) => current.map((item) => (item.id === appointmentId ? { ...item, workerId, workerName: name } : item)));
    },
    [workers]
  );

  /** Cambia fecha/hora de una cita y recarga el mes (puede salir del mes visible). */
  const reschedule = useCallback(async (appointmentId: string, date: string, timeSlot: string) => {
    const result = await rescheduleAppointment(appointmentId, date, timeSlot);
    setNonce((n) => n + 1);
    return result;
  }, []);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { byDay, blocked, workers, loading, error, reload, block, unblock, assign, reschedule };
}
