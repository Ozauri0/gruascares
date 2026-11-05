// Gestión de servicios de agenda (solo admin): serviteca y grúa/asistencia.

import { apiDelete, apiGet, apiPatch, apiPost } from "./api";

export type ServiceCategory = "serviteca" | "grua";

export const SERVICE_CATEGORY_LABEL: Record<ServiceCategory, string> = { serviteca: "Serviteca y Taller", grua: "Grúa y Asistencia" };

export type AdminService = {
  id: string;
  category: ServiceCategory;
  name: string;
  description: string | null;
  basePrice: number;
  estimatedDurationMin: number;
  isActive: boolean;
  appointmentCount: number;
};

export type ServiceInput = { category: ServiceCategory; name: string; description: string | null; basePrice: number; estimatedDurationMin: number; isActive: boolean };

export async function listAdminServices(signal?: AbortSignal): Promise<AdminService[]> {
  const { services } = await apiGet<{ services: AdminService[] }>("/api/admin/services", undefined, { signal });
  return services;
}

export async function createService(input: ServiceInput): Promise<AdminService> {
  return (await apiPost<{ service: AdminService }>("/api/admin/services", input)).service;
}

export async function updateService(id: string, patch: Partial<ServiceInput>): Promise<AdminService> {
  return (await apiPatch<{ service: AdminService }>(`/api/admin/services/${encodeURIComponent(id)}`, patch)).service;
}

export async function deleteService(id: string): Promise<void> {
  await apiDelete(`/api/admin/services/${encodeURIComponent(id)}`);
}
