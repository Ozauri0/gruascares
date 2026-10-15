"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { assignMechanic, blockDay, rescheduleAppointment, fetchAgendaRange, listBlockedDays, listStaff, unblockDay } from "./admin-api";
import type { BlockedDay, StaffMember } from "./admin-types";
import type { AgendaItem } from "./workshop-types";

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDay = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`;

/** Citas del mes, días bloqueados y personal de taller para el calendario maestro. */
export function useCalendar(year: number, month: number) {
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [blocked, setBlocked] = useState<BlockedDay[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
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
      listStaff(controller.signal),
    ])
      .then(([agenda, days, people]) => {
        setItems(agenda);
        setBlocked(days);
        setStaff(people);
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
    async (appointmentId: string, mechanicId: string) => {
      await assignMechanic(appointmentId, mechanicId);
      const name = staff.find((s) => s.id === mechanicId)?.name ?? null;
      setItems((current) => current.map((item) => (item.id === appointmentId ? { ...item, mechanicId, mechanicName: name } : item)));
    },
    [staff]
  );

  /** Cambia fecha/hora de una cita y recarga el mes (puede salir del mes visible). */
  const reschedule = useCallback(async (appointmentId: string, date: string, timeSlot: string) => {
    const result = await rescheduleAppointment(appointmentId, date, timeSlot);
    setNonce((n) => n + 1);
    return result;
  }, []);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { byDay, blocked, staff, loading, error, reload, block, unblock, assign, reschedule };
}
