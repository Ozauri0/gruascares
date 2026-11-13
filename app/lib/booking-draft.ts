// Borrador del formulario de /agendar: se guarda al pasar por el login o el registro (último paso) para que, al volver,
// la persona encuentre su servicio, fecha, horario y detalles como los dejó. Vive en localStorage porque el enlace
// de confirmación del correo se abre en otra pestaña (igual que la ruta recordada en post-login.ts).

import type { TransferDraft } from "./cargo";

const KEY = "gruas-cares-booking-draft";
/** El borrador vale una hora (lo que tarda crear la cuenta y confirmar el correo). */
const TTL_MS = 60 * 60 * 1000;

export type BookingDraft = {
  serviceId: string;
  date: string;
  time: string;
  location: string;
  transfer: TransferDraft;
  notes: string;
  vehicleId: string;
};

type Stored = { draft: BookingDraft; at: number };

export function saveBookingDraft(draft: BookingDraft): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ draft, at: Date.now() } satisfies Stored));
  } catch {
    // sin almacenamiento: simplemente no se recuerda
  }
}

/** Devuelve el borrador guardado (y lo borra), o null si no hay o ya venció. */
export function takeBookingDraft(): BookingDraft | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    window.localStorage.removeItem(KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<Stored>) : null;
    if (!saved || typeof saved.at !== "number" || Date.now() - saved.at >= TTL_MS || !saved.draft) return null;
    const d = saved.draft;
    if (typeof d.serviceId !== "string" || !d.serviceId) return null;
    return {
      serviceId: d.serviceId,
      date: typeof d.date === "string" ? d.date : "",
      time: typeof d.time === "string" ? d.time : "",
      location: typeof d.location === "string" ? d.location : "",
      transfer: d.transfer && typeof d.transfer === "object" ? d.transfer : ({} as TransferDraft),
      notes: typeof d.notes === "string" ? d.notes : "",
      vehicleId: typeof d.vehicleId === "string" ? d.vehicleId : "",
    };
  } catch {
    return null;
  }
}

/** Una fecha que ya pasó (u horario de ese día) no se restaura; el resto del borrador sí. */
export function withValidDate(draft: BookingDraft, today: string, canBookPast = false): BookingDraft {
  if (!draft.date || canBookPast || draft.date >= today) return draft;
  return { ...draft, date: "", time: "" };
}
