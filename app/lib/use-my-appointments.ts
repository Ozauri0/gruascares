"use client";

import { useCallback, useEffect, useState } from "react";
import { cancelMyAppointment, listMyAppointments, type PortalItem } from "./my-appointments-api";

/** Citas del cliente autenticado cargadas desde la API. */
export function useMyAppointments() {
  const [items, setItems] = useState<PortalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await listMyAppointments());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar tus citas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const cancel = useCallback(async (id: string) => {
    await cancelMyAppointment(id);
    setItems((current) => current.map((item) => (item.appointment.id === id ? { ...item, appointment: { ...item.appointment, status: "cancelada" } } : item)));
  }, []);

  return { items, loading, error, reload, cancel };
}
