"use client";

import { useCallback, useEffect, useState } from "react";
import type { PortalVehicle } from "./portal-types";
import { createVehicle, deleteVehicle, listVehicles, updateVehicle, type VehicleInput } from "./vehicles-api";

/** Vehículos del usuario autenticado, cargados desde la API (sin respaldo local). `enabled=false` no consulta (p. ej. invitados). */
export function useVehicles({ enabled = true }: { enabled?: boolean } = {}) {
  const [vehicles, setVehicles] = useState<PortalVehicle[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setVehicles(await listVehicles());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar tus vehículos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void reload();
    else {
      setVehicles([]);
      setLoading(false);
    }
  }, [enabled, reload]);

  const add = useCallback(async (input: VehicleInput) => {
    const created = await createVehicle(input);
    setVehicles((current) => [created, ...current]);
    return created;
  }, []);

  const update = useCallback(async (id: string, input: VehicleInput) => {
    const updated = await updateVehicle(id, input);
    setVehicles((current) => current.map((v) => (v.id === id ? updated : v)));
    return updated;
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteVehicle(id);
    setVehicles((current) => current.filter((v) => v.id !== id));
  }, []);

  return { vehicles, loading, error, reload, add, update, remove };
}
