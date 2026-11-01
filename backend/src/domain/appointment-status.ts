export const APPOINTMENT_STATUSES = ["solicitada", "confirmada", "en_proceso", "finalizada", "cancelada"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/**
 * Flujo válido de una cita en el taller:
 * solicitada → confirmada → en_proceso → finalizada, con cancelación posible solo
 * antes de que el vehículo entre a taller. `finalizada` y `cancelada` son estados finales.
 */
export const ALLOWED_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  solicitada: ["confirmada", "cancelada"],
  confirmada: ["en_proceso", "cancelada"],
  en_proceso: ["finalizada"],
  finalizada: [],
  cancelada: [],
};

export function isAppointmentStatus(value: unknown): value is AppointmentStatus {
  return typeof value === "string" && (APPOINTMENT_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Estados en los que aún se puede cancelar una cita. */
export function isCancellable(status: AppointmentStatus): boolean {
  return canTransition(status, "cancelada");
}
