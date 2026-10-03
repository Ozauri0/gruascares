"use client";

import { useEffect, useState } from "react";
import InnerFooter from "../../components/InnerFooter";
import InnerHeader from "../../components/InnerHeader";
import StatusBadge from "../../components/StatusBadge";
import { MOCK_APPOINTMENTS, MOCK_REPORTS } from "../../lib/portal-mocks";
import type { PortalAppointment } from "../../lib/portal-types";

const ACTIVE_STATUSES = ["solicitada", "confirmada", "en_proceso"];

function byDateTime(a: PortalAppointment, b: PortalAppointment) {
  return `${a.scheduledDate} ${a.timeSlot}`.localeCompare(`${b.scheduledDate} ${b.timeSlot}`);
}

export default function AppointmentsPage() {
  const [reportId, setReportId] = useState<string | null>(null);
  const active = [...MOCK_APPOINTMENTS].filter((item) => ACTIVE_STATUSES.includes(item.status)).sort(byDateTime);
  const history = [...MOCK_APPOINTMENTS].filter((item) => !ACTIVE_STATUSES.includes(item.status)).sort((a, b) => byDateTime(b, a));
  const report = MOCK_REPORTS.find((item) => item.appointmentId === reportId);
  const reportAppointment = MOCK_APPOINTMENTS.find((item) => item.id === reportId);

  useEffect(() => {
    if (!reportId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReportId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reportId]);

  return (
    <>
      <InnerHeader />
      <main className="inner-page portal-page">
        <section className="page-intro wrap portal-intro">
          <div>
            <p className="eyebrow">Portal de clientes</p>
            <h1>Mis <em>citas.</em></h1>
          </div>
          <p>Sigue el estado de tus solicitudes y revisa el informe técnico de cada atención finalizada.</p>
        </section>

        <section className="portal-section wrap">
          <div className="portal-toolbar">
            <a className="portal-back" href="/portal">← Volver al portal</a>
          </div>

          <div className="section-head portal-head">
            <div><p className="eyebrow">En curso</p><h2>Activas</h2></div>
            <span className="catalog-count">{active.length} citas</span>
          </div>
          {active.length === 0 ? (
            <p className="portal-empty">No tienes citas activas.</p>
          ) : (
            <div className="portal-appointments history-list">
              {active.map((item) => (
                <AppointmentCard key={item.id} item={item} />
              ))}
            </div>
          )}

          <div className="section-head portal-head history-head">
            <div><p className="eyebrow">Anteriores</p><h2>Historial</h2></div>
            <span className="catalog-count">{history.length} atenciones</span>
          </div>
          {history.length === 0 ? (
            <p className="portal-empty">Aún no tienes atenciones finalizadas.</p>
          ) : (
            <div className="portal-appointments history-list">
              {history.map((item) => (
                <AppointmentCard key={item.id} item={item} onReport={() => setReportId(item.id)} hasReport={MOCK_REPORTS.some((r) => r.appointmentId === item.id)} />
              ))}
            </div>
          )}
        </section>
      </main>
      <InnerFooter />

      {reportId && (
        <div className="modal-overlay" onClick={() => setReportId(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Informe técnico de la atención"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <h2>Informe técnico</h2>
              <button type="button" className="modal-close" aria-label="Cerrar" onClick={() => setReportId(null)}>×</button>
            </div>
            {report && reportAppointment ? (
              <div className="report">
                <div className="portal-card-top"><StatusBadge status={reportAppointment.status} /><span className="portal-slot">{reportAppointment.scheduledDate} · {reportAppointment.timeSlot}</span></div>
                <h3>{reportAppointment.serviceName}</h3>
                <p>{reportAppointment.vehicleLabel} · Patente {reportAppointment.vehiclePlate}</p>
                <dl>
                  <div><dt>Atendido por</dt><dd>{report.mechanicName}</dd></div>
                  <div><dt>Observaciones</dt><dd>{report.observations}</dd></div>
                  {report.partsReplaced && <div><dt>Repuestos</dt><dd>{report.partsReplaced}</dd></div>}
                  {report.mileageAtService !== null && <div><dt>Kilometraje</dt><dd>{report.mileageAtService.toLocaleString("es-CL")} km</dd></div>}
                  {report.recommendations && <div><dt>Recomendaciones</dt><dd>{report.recommendations}</dd></div>}
                </dl>
              </div>
            ) : (
              <p className="portal-empty">El informe de esta atención aún no está disponible. Te avisaremos por correo cuando el taller lo publique.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function AppointmentCard({ item, onReport, hasReport }: { item: PortalAppointment; onReport?: () => void; hasReport?: boolean }) {
  return (
    <article className="portal-card history-card">
      <div className="portal-card-top"><StatusBadge status={item.status} /><span className="portal-slot">{item.scheduledDate} · {item.timeSlot}</span></div>
      <h3>{item.serviceName}</h3>
      <p>{item.vehicleLabel} · Patente {item.vehiclePlate}</p>
      {item.location && <p className="portal-meta">{item.location}</p>}
      {item.status === "finalizada" && (
        <div className="vehicle-actions history-report">
          <button type="button" onClick={onReport} disabled={!hasReport} title={hasReport ? "Ver informe del mecánico" : "Informe aún no disponible"}>
            {hasReport ? "Ver informe técnico" : "Informe pendiente"}
          </button>
        </div>
      )}
    </article>
  );
}
