import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { saveBookingDraft, takeBookingDraft, withValidDate, type BookingDraft } from "./booking-draft";
import { EMPTY_TRANSFER } from "./cargo";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { window?: unknown }).window = {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
  };
});
afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

const draft: BookingDraft = {
  serviceId: "svc-1",
  date: "2026-11-20",
  time: "10:30",
  location: "Prat 450",
  transfer: { ...EMPTY_TRANSFER, destination: "Pucón" },
  notes: "No arranca",
  vehicleId: "veh-1",
};

describe("borrador de /agendar", () => {
  test("lo guardado se recupera completo una sola vez", () => {
    saveBookingDraft(draft);
    expect(takeBookingDraft()).toEqual(draft);
    expect(takeBookingDraft()).toBeNull();
  });

  test("vence a la hora", () => {
    store.set("gruas-cares-booking-draft", JSON.stringify({ draft, at: Date.now() - 2 * 60 * 60 * 1000 }));
    expect(takeBookingDraft()).toBeNull();
  });

  test("ignora datos corruptos o sin servicio", () => {
    store.set("gruas-cares-booking-draft", "{no es json");
    expect(takeBookingDraft()).toBeNull();
    store.set("gruas-cares-booking-draft", JSON.stringify({ draft: { ...draft, serviceId: "" }, at: Date.now() }));
    expect(takeBookingDraft()).toBeNull();
  });

  test("una fecha pasada no se restaura, pero lo demás sí; ventas y admin pueden mantenerla", () => {
    const past = withValidDate({ ...draft, date: "2026-01-01" }, "2026-11-09");
    expect(past).toMatchObject({ date: "", time: "", notes: "No arranca", location: "Prat 450" });
    expect(withValidDate(draft, "2026-11-09")).toEqual(draft);
    expect(withValidDate({ ...draft, date: "2026-01-01" }, "2026-11-09", true).date).toBe("2026-01-01");
  });
});
