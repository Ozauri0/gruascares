"use client";

import { useEffect, useMemo, useState } from "react";
import InnerFooter from "../../components/InnerFooter";
import AreaNav from "../../components/AreaNav";
import StatusBadge from "../../components/StatusBadge";
import { CANCELLABLE_STATUSES, splitAppointments, type PortalItem } from "../../lib/my-appointments-api";
import { formatPlate } from "../../lib/plate";
import { useMyAppointments } from "../../lib/use-my-appointments";
import Skeleton from "../../components/Skeleton";
import Icon from "../../components/Icon";

export default function AppointmentsPage() {
  const { items, loading, error, reload, cancel } = useMyAppointments();
  const [reportId, setReportId] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const { active, history } = useMemo(() => splitAppointments(items), [items]);
  const current = items.find((item) => item.appointment.id === reportId);
  const report = current?.report ?? null;
  const reportAppointment = current?.appointment;

  async function requestCancel(id: string) {
    if (confirmCancel !== id) {
      setConfirmCancel(id);
      return;
    }
    setConfirmCancel(null);
    setActionError("");
    try {
      await cancel(id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo cancelar la cita.");
      void reload();
    }
  }

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
      <main className="inner-page portal-page">
        <section className="page-intro wrap portal-intro">
          <div>
            <p className="eyebrow">Mi Cuenta</p>
            <h1>Mis <em>citas.</em></h1>
          </div>
          <div>
            <p className="portal-subtext">Historial completo de tus atenciones mecánicas y traslados de grúa con sus informes técnicos detallados.</p>
          </div>
        </section>

        <div className="portal-stack wrap">
          <AreaNav />
          {/* Navegación del portal */}
          <nav className="portal-nav-tabs" aria-label="Secciones del portal">
            <a href="/portal" className="portal-nav-tab">
              <span className="tab-icon"><Icon name="home" bare /></span>
              <span>Mi Resumen</span>
            </a>
            <a href="/portal/citas" className="portal-nav-tab active">
              <span className="tab-icon"><Icon name="clipboard" bare /></span>
              <span>Mis Citas</span>
              {!loading && !error && active.length > 0 && <span className="tab-pill">{active.length}</span>}
            </a>
            <a href="/portal/vehiculos" className="portal-nav-tab">
              <span className="tab-icon"><Icon name="car" bare /></span>
              <span>Mis Vehículos</span>
            </a>
            <a href="/portal/perfil" className="portal-nav-tab">
              <span className="tab-icon"><Icon name="user" bare /></span>
              <span>Mi Perfil</span>
            </a>
            <a href="/agendar" className="portal-nav-tab portal-nav-cta">
              <span className="tab-icon"><Icon name="plus" bare /></span>
              <span>Agendar Nuevo</span>
            </a>
          </nav>

          <section className="portal-section">
            <div className="section-head portal-head">
              <div>
                <p className="eyebrow">En curso</p>
                <h2>Atenciones Activas</h2>
                <span className="section-subtitle">Servicios solicitados o actualmente en proceso en nuestro taller</span>
              </div>
              <span className="portal-badge-counter">{loading ? "Cargando…" : error ? "No disponible" : `${active.length} ${active.length === 1 ? "cita activa" : "citas activas"}`}</span>
            </div>
            {actionError && <p className="field-error" role="alert">{actionError}</p>}
            {loading ? (
              <Skeleton label="Cargando tus citas…" />
            ) : error ? (
              <div className="portal-empty-card" role="alert">
                <p>{error}</p>
                <button type="button" className="button button-sm" onClick={() => void reload()}>Reintentar</button>
              </div>
            ) : active.length === 0 ? (
              <div className="portal-empty-card">
                <p>No tienes citas activas en este momento.</p>
                <a className="button button-sm" href="/agendar">Agendar nuevo servicio ↗</a>
              </div>
            ) : (
              <div className="portal-appointments history-list">
                {active.map((item) => (
                  <AppointmentCard
                    key={item.appointment.id}
                    item={item}
                    onCancel={CANCELLABLE_STATUSES.includes(item.appointment.status) ? () => void requestCancel(item.appointment.id) : undefined}
                    confirmingCancel={confirmCancel === item.appointment.id}
                    onBlurCancel={() => setConfirmCancel(null)}
                  />
                ))}
              </div>
            )}

            <div className="section-head portal-head history-head">
              <div>
                <p className="eyebrow">Completadas</p>
                <h2>Historial de Servicios</h2>
                <span className="section-subtitle">Servicios finalizados con su informe técnico emitido por el mecánico</span>
              </div>
              <span className="portal-badge-counter">{loading ? "Cargando…" : error ? "No disponible" : `${history.length} ${history.length === 1 ? "atención previa" : "atenciones previas"}`}</span>
            </div>
            {loading || error ? null : history.length === 0 ? (
              <p className="portal-empty">Aún no registras atenciones finalizadas.</p>
            ) : (
              <div className="portal-appointments history-list">
                {history.map((item) => (
                  <AppointmentCard key={item.appointment.id} item={item} onReport={() => setReportId(item.appointment.id)} />
                ))}
              </div>
            )}
          </section>
        </div>
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

function AppointmentCard({
  item,
  onReport,
  onCancel,
  confirmingCancel,
  onBlurCancel,
}: {
  item: PortalItem;
  onReport?: () => void;
  onCancel?: () => void;
  confirmingCancel?: boolean;
  onBlurCancel?: () => void;
}) {
  const { appointment, report } = item;
  return (
    <article className="portal-card history-card">
      <div className="portal-card-top"><StatusBadge status={appointment.status} /><span className="portal-slot">{appointment.scheduledDate} · {appointment.timeSlot}</span></div>
      <h3>{appointment.serviceName}</h3>
      <p>{appointment.vehiclePlate ? `${appointment.vehicleLabel} · Patente ${formatPlate(appointment.vehiclePlate)}` : appointment.vehicleLabel}</p>
      {appointment.location && <p className="portal-meta">{appointment.location}</p>}
      {appointment.status === "finalizada" && (
        <div className="vehicle-actions history-report">
          <button type="button" onClick={onReport} disabled={!report} title={report ? "Ver informe del mecánico" : "Informe aún no disponible"}>
            {report ? "Ver informe técnico" : "Informe pendiente"}
          </button>
        </div>
      )}
      {onCancel && (
        <div className="vehicle-actions history-report">
          <button type="button" className={confirmingCancel ? "danger confirm" : "danger"} onClick={onCancel} onBlur={onBlurCancel}>
            {confirmingCancel ? "Confirmar cancelación" : "Cancelar cita"}
          </button>
        </div>
      )}
    </article>
  );
}
