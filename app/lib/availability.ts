// Disponibilidad de bloques horarios del taller.
// Fuente de verdad: GET /api/appointments/availability?date=YYYY-MM-DD (ver appointments-api.ts).
// Los bloques (y su capacidad) los define el backend; el frontend solo los muestra.

/** `blocked`: el calendario maestro lo bloqueó, pero ventas y admin pueden agendarlo igual (solo llega con `ignoreBlocks`). */
export type SlotAvailability = { time: string; available: boolean; reason?: string; blocked?: boolean };
