"use client";

import { useEffect, useState } from "react";
import InnerFooter from "../components/InnerFooter";
import InnerHeader from "../components/InnerHeader";
import LogoutButton from "../components/LogoutButton";
import StatusBadge from "../components/StatusBadge";
import { MOCK_APPOINTMENTS, MOCK_USER, MOCK_VEHICLES } from "../lib/portal-mocks";
import { formatPlate } from "../lib/plate";
import type { PortalVehicle } from "../lib/portal-types";

// Portal del cliente (T2.4). Usa datos demostrativos hasta conectar
// AuthContext + GET /api/auth/me, /api/appointments y /api/vehicles (T2.2).
const ACTIVE_STATUSES = ["solicitada", "confirmada", "en_proceso"];

function parseLocal(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function daysUntil(iso: string): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((parseLocal(iso).getTime() - today.getTime()) / 86400000);
}

function countdownLabel(iso: string): string {
  const days = daysUntil(iso);
  if (days <= 0) return "¡Es hoy!";
  if (days === 1) return "Mañana";
  return `En ${days} días`;
}

function longDate(iso: string): string {
  const text = new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(parseLocal(iso));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function PortalPage() {
  const [vehicles, setVehicles] = useState<PortalVehicle[]>(MOCK_VEHICLES);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("gruas-cares-vehicles");
      if (saved) setVehicles(JSON.parse(saved));
    } catch {
      // Sin respaldo local: se muestran los datos demostrativos.
    }
  }, []);

  const firstName = MOCK_USER.name.split(" ")[0];
  const active = [...MOCK_APPOINTMENTS]
    .filter((item) => ACTIVE_STATUSES.includes(item.status))
    .sort((a, b) => `${a.scheduledDate} ${a.timeSlot}`.localeCompare(`${b.scheduledDate} ${b.timeSlot}`));
  const next = active[0];
  const rest = active.slice(1);

  return (
    <>
      <InnerHeader />
      <main className="inner-page portal-page">
        <section className="page-intro wrap portal-intro">
          <div>
            <p className="eyebrow">Portal de clientes</p>
            <h1>Hola, <em>{firstName}.</em></h1>
          </div>
          <div><p className="portal-contact">{MOCK_USER.email}{MOCK_USER.phone ? ` · ${MOCK_USER.phone}` : ""}</p><LogoutButton /></div>
        </section>

        <div className="portal-stack wrap">
          {next ? (
            <section className="next-hero" aria-label="Próxima cita">
              <div className="next-date"><strong>{next.scheduledDate.slice(8, 10)}</strong><span>{longDate(next.scheduledDate).split(" ").pop()}</span></div>
              <div className="next-info">
                <div className="next-top"><StatusBadge status={next.status} /><span className="next-countdown">{countdownLabel(next.scheduledDate)} · {next.timeSlot} hrs</span></div>
                <h2>{next.serviceName}</h2>
                <p>{longDate(next.scheduledDate)} · {next.vehicleLabel} ({formatPlate(next.vehiclePlate)}){next.location ? ` · ${next.location}` : ""}</p>
              </div>
            </section>
          ) : (
            <section className="next-hero next-empty" aria-label="Sin citas pendientes">
              <div className="next-info">
                <h2>Sin citas pendientes</h2>
                <p>Agenda tu próximo servicio de grúa o serviteca cuando lo necesites.</p>
              </div>
              <a className="button" href="/agendar">Agendar servicio <span>↗</span></a>
            </section>
          )}

          <section aria-label="Mis vehículos">
            <div className="portal-row-head">
              <h2>Mis vehículos</h2>
              <a href="/portal/vehiculos">Gestionar <span>→</span></a>
            </div>
            {vehicles.length === 0 ? (
              <p className="portal-empty">Aún no registras vehículos. <a href="/portal/vehiculos">Agrega el primero →</a></p>
            ) : (
              <div className="vehicle-strip">
                {vehicles.map((vehicle) => (
                  <a className="vehicle-mini" href="/portal/vehiculos" key={vehicle.id}>
                    <span className="vehicle-mini-plate">{formatPlate(vehicle.plate)}</span>
                    <strong>{vehicle.brand} {vehicle.model}</strong>
                    <small>{vehicle.year ?? "—"} · {vehicle.mileage.toLocaleString("es-CL")} km</small>
                  </a>
                ))}
              </div>
            )}
          </section>

          {rest.length > 0 && (
            <section aria-label="Otras citas activas">
              <div className="portal-row-head">
                <h2>También pendiente</h2>
                <a href="/portal/citas">Ver todas <span>→</span></a>
              </div>
              <div className="compact-list">
                {rest.map((item) => (
                  <a className="compact-row" href="/portal/citas" key={item.id}>
                    <StatusBadge status={item.status} />
                    <strong>{item.serviceName}</strong>
                    <span>{item.scheduledDate.slice(8, 10)}/{item.scheduledDate.slice(5, 7)} · {item.timeSlot}</span>
                  </a>
                ))}
              </div>
            </section>
          )}

          <section className="quick-row" aria-label="Acciones">
            <a className="button quick-primary" href="/agendar">Agendar servicio <span>↗</span></a>
            <a className="button quick-call" href="tel:+56991627809">Emergencia 24/7 · +56 9 9162 7809</a>
          </section>
        </div>
      </main>
      <InnerFooter />
    </>
  );
}
