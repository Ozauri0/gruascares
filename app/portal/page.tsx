"use client";

import { useEffect, useState } from "react";
import InnerFooter from "../components/InnerFooter";
import InnerHeader from "../components/InnerHeader";
import LogoutButton from "../components/LogoutButton";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../lib/auth";
import { MOCK_APPOINTMENTS, MOCK_VEHICLES } from "../lib/portal-mocks";
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

  const { user } = useAuth();
  const firstName = user ? user.name.split(" ")[0] : "";
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
            <p className="eyebrow">Mi Cuenta</p>
            <h1>Hola{firstName ? ", " : ""}<em>{firstName ? `${firstName}.` : "."}</em></h1>
          </div>
          <div>
            <p className="portal-contact">{user ? `${user.email}${user.phone ? ` · ${user.phone}` : ""}` : "\u00a0"}</p>
            <LogoutButton />
          </div>
        </section>

        <div className="portal-stack wrap">
          {/* Accesos rápidos de navegación para el cliente */}
          <nav className="portal-nav-tabs" aria-label="Secciones del portal">
            <a href="/portal" className="portal-nav-tab active">
              <span className="tab-icon">🏠</span>
              <span>Mi Resumen</span>
            </a>
            <a href="/portal/citas" className="portal-nav-tab">
              <span className="tab-icon">📋</span>
              <span>Mis Citas</span>
              {active.length > 0 && <span className="tab-pill">{active.length}</span>}
            </a>
            <a href="/portal/vehiculos" className="portal-nav-tab">
              <span className="tab-icon">🚗</span>
              <span>Mis Vehículos</span>
              <span className="tab-pill">{vehicles.length}</span>
            </a>
            <a href="/agendar" className="portal-nav-tab portal-nav-cta">
              <span className="tab-icon">➕</span>
              <span>Agendar Nuevo</span>
            </a>
          </nav>

          <div className="portal-layout">
            <div className="portal-main">
          {next ? (
            <section className="next-hero" aria-label="Próxima cita">
              <div className="next-date">
                <strong>{next.scheduledDate.slice(8, 10)}</strong>
                <span>{longDate(next.scheduledDate).split(" ").pop()}</span>
              </div>
              <div className="next-info">
                <div className="next-top">
                  <StatusBadge status={next.status} />
                  <span className="next-countdown">{countdownLabel(next.scheduledDate)} · {next.timeSlot} hrs</span>
                </div>
                <h2>{next.serviceName}</h2>
                <p>
                  📅 {longDate(next.scheduledDate)} a las {next.timeSlot} hrs<br />
                  🚗 {next.vehicleLabel} · Patente <b>{formatPlate(next.vehiclePlate)}</b>
                  {next.location ? ` · 📍 ${next.location}` : ""}
                </p>
                <div className="next-actions">
                  <a className="button next-btn-details" href="/portal/citas">Ver detalle en Mis Citas <span>→</span></a>
                </div>
              </div>
            </section>
          ) : (
            <section className="next-hero next-empty" aria-label="Sin citas pendientes">
              <div className="next-info">
                <div className="next-empty-icon">📅</div>
                <h2>No tienes atenciones pendientes</h2>
                <p>Cuando solicites una grúa o mantención en taller, podrás seguir cada paso aquí en tiempo real.</p>
              </div>
              <a className="button" href="/agendar">Agendar un servicio <span>↗</span></a>
            </section>
          )}

          {rest.length > 0 && (
            <section aria-label="Otras citas activas">
              <div className="portal-row-head">
                <div>
                  <h2>Otras atenciones en curso</h2>
                  <span className="section-subtitle">Servicios adicionales programados</span>
                </div>
                <a href="/portal/citas">Ver historial completo <span>→</span></a>
              </div>
              <div className="compact-list">
                {rest.map((item) => (
                  <a className="compact-row" href="/portal/citas" key={item.id}>
                    <StatusBadge status={item.status} />
                    <strong>{item.serviceName}</strong>
                    <span>{item.scheduledDate.slice(8, 10)}/{item.scheduledDate.slice(5, 7)} · {item.timeSlot} hrs</span>
                  </a>
                ))}
              </div>
            </section>
          )}

            </div>
            <aside className="portal-side">
          <section aria-label="Mis vehículos">
            <div className="portal-row-head">
              <div>
                <h2>Mis vehículos</h2>
                <span className="section-subtitle">Autos y maquinarias guardadas para agendar rápidamente</span>
              </div>
              <a href="/portal/vehiculos">Administrar vehículos <span>→</span></a>
            </div>
            {vehicles.length === 0 ? (
              <div className="portal-empty-card">
                <p>Aún no has registrado vehículos en tu perfil.</p>
                <a className="button button-sm" href="/portal/vehiculos">+ Agregar tu primer vehículo</a>
              </div>
            ) : (
              <div className="vehicle-strip">
                {vehicles.map((vehicle) => (
                  <a className="vehicle-mini" href="/portal/vehiculos" key={vehicle.id}>
                    <span className="vehicle-mini-plate">{formatPlate(vehicle.plate)}</span>
                    <strong>{vehicle.brand} {vehicle.model}</strong>
                    <small>{vehicle.year ? `Año ${vehicle.year}` : "Año no informado"} · {vehicle.mileage.toLocaleString("es-CL")} km</small>
                  </a>
                ))}
              </div>
            )}
          </section>

          <section className="quick-row" aria-label="Acciones rápidas">
            <a className="button quick-primary" href="/agendar">
              <span>📅 Agendar nueva atención</span> <span>↗</span>
            </a>
            <a className="button quick-call" href="tel:+56991627809">
              <span>🚨 Grúa de Emergencia 24/7 · Llamar</span>
            </a>
          </section>
            </aside>
          </div>
        </div>
      </main>
      <InnerFooter />
    </>
  );
}
