// Disponibilidad de bloques horarios del taller.
// Fuente de verdad: GET /api/appointments/availability?date=YYYY-MM-DD (ver appointments-api.ts).
// Los bloques (y su capacidad) los define el backend; el frontend solo los muestra.

export type SlotAvailability = { time: string; available: boolean; reason?: string };
