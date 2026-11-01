"use client";

import { useRef, useState } from "react";
import InnerFooter from "../../components/InnerFooter";
import AdminNav from "../components/AdminNav";
import BulkBlockPanel from "../components/BulkBlockPanel";
import DayPanel from "../components/DayPanel";
import { todayInSantiago } from "../../lib/dates";
import { isoDay, useCalendar } from "../../lib/use-calendar";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export default function CalendarPage() {
  const [year, setYear] = useState(() => Number(todayInSantiago().slice(0, 4)));
  const [month, setMonth] = useState(() => Number(todayInSantiago().slice(5, 7)) - 1);
  const [selected, setSelected] = useState<string | null>(null);
  const { byDay, blocked, workers, loading, error, reload, block, unblock, assign, reschedule } = useCalendar(year, month);
  const panelRef = useRef<HTMLElement>(null);

  const blockedByDate = Object.fromEntries(blocked.map((b) => [b.date, b]));
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array<string | null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => isoDay(year, month, i + 1)),
  ];
  const monthLabel = new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric" }).format(new Date(year, month, 1));
  const today = todayInSantiago();

  function move(delta: number) {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
    setSelected(null);
  }

  function select(iso: string) {
    setSelected(iso);
    // En pantallas angostas el detalle queda debajo del calendario: se lleva a la vista.
    if (window.matchMedia("(max-width: 900px)").matches) {
      requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  return (
    <>
      <main className="inner-page portal-page">
        <section className="page-intro wrap portal-intro">
          <div>
            <p className="eyebrow">Administración</p>
            <h1>Calendario <em>maestro.</em></h1>
          </div>
          <div>
            <p className="portal-subtext">Carga del taller, horarios por día, bloqueos (días, horarios o fines de semana de todo el año) y cambios de hora de las citas.</p>
          </div>
        </section>

        <div className="portal-stack wrap">
          <AdminNav current="calendario" />

          {error && (
            <div className="portal-empty-card" role="alert">
              <p>{error}</p>
              <button type="button" className="button button-sm" onClick={reload}>Reintentar</button>
            </div>
          )}

          <BulkBlockPanel onDone={reload} />

          <section aria-label="Calendario del taller" aria-busy={loading}>
            <div className="portal-toolbar calendar-toolbar">
              <div className="month-nav">
                <button type="button" aria-label="Mes anterior" onClick={() => move(-1)}>←</button>
                <strong>{monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}</strong>
                <button type="button" aria-label="Mes siguiente" onClick={() => move(1)}>→</button>
              </div>
              <div className="calendar-legend">
                <span className="legend-item"><i className="legend-dot dot-active" /> Con atenciones</span>
                <span className="legend-item"><i className="legend-dot dot-blocked" /> Día bloqueado</span>
                {loading && <span className="legend-item">Cargando…</span>}
              </div>
            </div>

            <div className="calendar-layout">
              <div className="calendar">
                <div className="calendar-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
                <div className="calendar-grid">
                  {cells.map((iso, index) => {
                    if (!iso) return <span className="calendar-empty" key={`e-${index}`} />;
                    const count = (byDay[iso] ?? []).filter((i) => i.status !== "cancelada").length;
                    const isBlocked = Boolean(blockedByDate[iso]);
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => select(iso)}
                        className={["calendar-day", selected === iso ? "selected" : "", isBlocked ? "blocked" : "", count > 0 ? "has-items" : "", iso === today ? "today" : ""].join(" ")}
                        aria-label={`${iso}${isBlocked ? ", bloqueado" : ""}, ${count} citas`}
                        aria-pressed={selected === iso}
                      >
                        <span className="calendar-number">{Number(iso.slice(8, 10))}</span>
                        {count > 0 && <span className="calendar-count">{count}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <aside className="calendar-detail" aria-label="Detalle del día" ref={panelRef}>
                {!selected ? (
                  <p className="portal-empty">Selecciona un día para ver sus citas, horarios y opciones.</p>
                ) : (
                  <DayPanel
                    key={selected}
                    date={selected}
                    dayBlock={blockedByDate[selected]}
                    items={byDay[selected] ?? []}
                    workers={workers}
                    onBlockDay={(reason) => block(selected, reason)}
                    onUnblockDay={unblock}
                    onAssign={assign}
                    onReschedule={reschedule}
                  />
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
