"use client";

import { useEffect, useMemo, useState } from "react";
import InnerFooter from "../../components/InnerFooter";
import InnerHeader from "../../components/InnerHeader";
import StatusBadge from "../../components/StatusBadge";
import { MOCK_AGENDA, MOCK_MECHANICS } from "../../lib/workshop-mocks";
import type { AgendaItem } from "../../lib/workshop-mocks";

const BLOCKED_KEY = "gruas-cares-blocked-days";
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const TEMPLATES = [
  { serviceName: "Cambio de aceite", timeSlot: "09:00" },
  { serviceName: "Mantención preventiva 10.000 km", timeSlot: "10:30" },
  { serviceName: "Grúa de plataforma hidráulica", timeSlot: "15:00" },
  { serviceName: "Revisión preventiva", timeSlot: "16:30" },
];

function isoDay(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Agenda demostrativa del mes: combina la agenda base con citas generadas de
// forma estable por fecha. Reemplazar por GET /api/appointments?month= (T1.9).
function buildMonth(year: number, month: number): Record<string, AgendaItem[]> {
  const days = new Date(year, month + 1, 0).getDate();
  const map: Record<string, AgendaItem[]> = {};
  for (let day = 1; day <= days; day++) {
    const iso = isoDay(year, month, day);
    let hash = 0;
    for (const char of iso) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    const count = hash % 4;
    const items: AgendaItem[] = [];
    for (let i = 0; i < count; i++) {
      const template = TEMPLATES[(hash + i) % TEMPLATES.length];
      items.push({
        id: `g-${iso}-${i}`,
        date: iso,
        timeSlot: template.timeSlot,
        clientName: `Cliente ${((hash >> (i + 2)) % 40) + 1}`,
        clientPhone: "+56 9 0000 0000",
        vehiclePlate: "XXXX00",
        vehicleLabel: "Vehículo demo",
        serviceName: template.serviceName,
        status: (hash + i) % 5 === 0 ? "solicitada" : "confirmada",
        notes: null,
        mechanicId: i % 2 === 0 ? "u-mec1" : null,
      });
    }
    if (items.length > 0) map[iso] = items;
  }
  for (const item of MOCK_AGENDA) {
    map[item.date] = [...(map[item.date] ?? []), item].sort((a, b) => a.timeSlot.localeCompare(b.timeSlot));
  }
  return map;
}

function loadBlocked(): string[] {
  try {
    const saved = window.localStorage.getItem(BLOCKED_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // Sin bloqueos guardados.
  }
  return [];
}

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selected, setSelected] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  useEffect(() => {
    setBlocked(loadBlocked());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(BLOCKED_KEY, JSON.stringify(blocked));
  }, [blocked, hydrated]);

  const schedule = useMemo(() => buildMonth(year, month), [year, month]);
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array<string | null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => isoDay(year, month, i + 1)),
  ];

  const monthLabel = new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric" }).format(new Date(year, month, 1));
  const selectedItems = selected ? schedule[selected] ?? [] : [];

  function move(delta: number) {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
    setSelected(null);
  }

  function toggleBlock(iso: string) {
    setBlocked((current) => (current.includes(iso) ? current.filter((day) => day !== iso) : [...current, iso]));
  }

  return (
    <>
      <InnerHeader />
      <main className="inner-page portal-page">
        <section className="page-intro wrap portal-intro">
          <div>
            <p className="eyebrow">Administración</p>
            <h1>Calendario <em>maestro.</em></h1>
          </div>
          <p>Vista global del taller: citas por día, bloqueo de fechas no laborales y asignación de mecánicos.</p>
        </section>

        <div className="portal-stack wrap">
          <section aria-label="Calendario del taller">
            <div className="portal-toolbar">
              <a className="portal-back" href="/admin">← Volver al panel</a>
              <div className="month-nav">
                <button type="button" aria-label="Mes anterior" onClick={() => move(-1)}>←</button>
                <strong>{monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}</strong>
                <button type="button" aria-label="Mes siguiente" onClick={() => move(1)}>→</button>
              </div>
            </div>

            <div className="calendar-layout">
              <div className="calendar">
                <div className="calendar-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
                <div className="calendar-grid">
                  {cells.map((iso, index) => {
                    if (!iso) return <span className="calendar-empty" key={`e-${index}`} />;
                    const count = (schedule[iso] ?? []).length;
                    const isBlocked = blocked.includes(iso);
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => setSelected(iso)}
                        className={[
                          "calendar-day",
                          selected === iso ? "selected" : "",
                          isBlocked ? "blocked" : "",
                          count > 0 ? "has-items" : "",
                        ].join(" ")}
                        aria-label={`${iso}${isBlocked ? ", bloqueado" : ""}, ${count} citas`}
                      >
                        <span className="calendar-number">{Number(iso.slice(8, 10))}</span>
                        {count > 0 && <span className="calendar-count">{count}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <aside className="calendar-detail" aria-label="Detalle del día">
                {!selected ? (
                  <p className="portal-empty">Selecciona un día para ver sus citas y opciones.</p>
                ) : (
                  <>
                    <div className="portal-card-top">
                      <strong className="calendar-selected">{selected}</strong>
                      <button
                        type="button"
                        className={blocked.includes(selected) ? "toggle-btn active" : "toggle-btn"}
                        onClick={() => toggleBlock(selected)}
                      >
                        {blocked.includes(selected) ? "Desbloquear día" : "Bloquear día"}
                      </button>
                    </div>
                    {blocked.includes(selected) && <p className="blocked-note">Día no laboral: no se agenda ni se confirma.</p>}
                    {selectedItems.length === 0 ? (
                      <p className="portal-empty">Sin citas ese día.</p>
                    ) : (
                      <div className="calendar-items">
                        {selectedItems.map((item) => {
                          const assigned = assignments[item.id] ?? item.mechanicId ?? "";
                          return (
                            <div className="calendar-item" key={item.id}>
                              <div className="portal-card-top"><StatusBadge status={item.status} /><span className="portal-slot">{item.timeSlot}</span></div>
                              <strong>{item.serviceName}</strong>
                              <p>{item.clientName} · {item.vehiclePlate}</p>
                              <label>Mecánico
                                <select value={assigned} onChange={(event) => setAssignments((current) => ({ ...current, [item.id]: event.target.value }))}>
                                  <option value="">Sin asignar</option>
                                  {MOCK_MECHANICS.map((mechanic) => <option key={mechanic.id} value={mechanic.id}>{mechanic.name}</option>)}
                                </select>
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </aside>
            </div>
          </section>
        </div>
      </main>
      <InnerFooter />
    </>
  );
}
