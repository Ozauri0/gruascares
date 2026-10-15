// Vehículos del usuario contra el backend (backend/src/controllers/vehicle.controller.ts).

import { apiDelete, apiGet, apiPatch, apiPost } from "./api";
import { toPortalVehicle } from "./api-adapters";
import type { ApiVehicle } from "./api-types";
import type { PortalVehicle } from "./portal-types";

export type VehicleInput = { plate: string; brand: string; model: string; year: number | null; mileage: number };

export async function listVehicles(): Promise<PortalVehicle[]> {
  const { vehicles } = await apiGet<{ vehicles: ApiVehicle[] }>("/api/vehicles");
  return vehicles.map(toPortalVehicle);
}

export async function createVehicle(input: VehicleInput): Promise<PortalVehicle> {
  const { vehicle } = await apiPost<{ vehicle: ApiVehicle }>("/api/vehicles", input);
  return toPortalVehicle(vehicle);
}

export async function updateVehicle(id: string, input: VehicleInput): Promise<PortalVehicle> {
  const { vehicle } = await apiPatch<{ vehicle: ApiVehicle }>(`/api/vehicles/${encodeURIComponent(id)}`, input);
  return toPortalVehicle(vehicle);
}

export async function deleteVehicle(id: string): Promise<void> {
  await apiDelete(`/api/vehicles/${encodeURIComponent(id)}`);
}
