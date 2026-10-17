"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import InnerFooter from "../components/InnerFooter";
import { ApiError } from "../lib/api";
import type { ApiService } from "../lib/api-types";
import { createAppointment, listServices, type CreatedAppointment } from "../lib/appointments-api";
import { useAuth } from "../lib/auth";
import { CATEGORY_INFO, findServiceByQuery, groupServices, serviceHint, slotStatusLabel, type BookingCategory } from "../lib/booking";
import { todayInSantiago } from "../lib/dates";
import { formatPlate } from "../lib/plate";
import { useAvailability } from "../lib/use-availability";
import { useVehicles } from "../lib/use-vehicles";
import Icon from "../components/Icon";
import Skeleton from "../components/Skeleton";
import { rememberRedirect } from "../lib/post-login";

export default function AgendarPage() {
  const { user, loading: authLoading } = useAuth();
  const { vehicles } = useVehicles({ enabled: Boolean(user) });

  const [services, setServices] = useState<ApiService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState("");
  const [servicesNonce, setServicesNonce] = useState(0);

  const [category, setCategory] = useState<BookingCategory>("serviteca");
  const [serviceId, setServiceId] = useState("");
  const [today, setToday] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [timeError, setTimeError] = useState(false);

  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [vehicleId, setVehicleId] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [created, setCreated] = useState<CreatedAppointment | null>(null);

  const { slots, loading: slotsLoading, error: slotsError, refresh: refreshSlots } = useAvailability(date);
  const grouped = useMemo(() => groupServices(services), [services]);
  const availableServices = grouped[category];
  const selectedService = services.find((item) => item.id === serviceId);
  const selectedVehicle = vehicles.find((item) => item.id === vehicleId);

  // Hoy (hora de Chile) como fecha inicial.
  useEffect(() => {
    const current = todayInSantiago();
    setToday(current);
    setDate(current);
  }, []);

  // Servicios reales; si llega ?servicio=<nombre> se preselecciona.
  useEffect(() => {
    let cancelled = false;
    setServicesLoading(true);
    setServicesError("");
    listServices()
      .then((list) => {
        if (cancelled) return;
        setServices(list);
        const wanted = findServiceByQuery(list, new URLSearchParams(window.location.search).get("servicio"));
        const initial = wanted ?? groupServices(list).serviteca[0] ?? list[0];
        if (initial) {
          setCategory(initial.category === "grua" ? "gruas" : "serviteca");
          setServiceId(initial.id);
        }
      })
      .catch((err) => {
        if (!cancelled) setServicesError(err instanceof Error ? err.message : "No se pudieron cargar los servicios.");
      })
      .finally(() => {
        if (!cancelled) setServicesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [servicesNonce]);

  function changeCategory(next: BookingCategory) {
    setCategory(next);
    setServiceId(grouped[next][0]?.id ?? "");
    setTime("");
    setTimeError(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    if (!selectedService) {
      setFormError("Selecciona un servicio.");
      return;
    }
    if (!time) {
      setTimeError(true);
      return;
    }
    setSubmitting(true);
    try {
      const result = await createAppointment({
        serviceId: selectedService.id,
        scheduledDate: date,
        timeSlot: time,
        location: location.trim(),
        notes: notes.trim(),
        vehicleId,
      });
      setCreated(result);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo enviar la solicitud.");
      // 409: el bloque se llenó o se bloqueó mientras elegías → se recarga la disponibilidad.
      if (err instanceof ApiError && err.status === 409) {
        setTime("");
        refreshSlots();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <main className="inner-page booking-page">
        <section className="booking-intro wrap">
          <div>
            <p className="eyebrow">Agenda Online</p>
            <h1>Coordinemos<br /><em>tu servicio.</em></h1>
          </div>
          <p>Elige tu tipo de servicio y horario preferido. Te confirmamos rápidamente la disponibilidad técnica en Villarrica y la IX Región.</p>
        </section>

        <section className="booking-form-section">
          <div className="wrap booking-form-layout">
            <aside>
              <p className="aside-kicker">Atención directa</p>
              <h2>Hagámoslo<br /><em>simple.</em></h2>
              <p>Tu solicitud ingresa directamente a nuestra base de coordinación de taller o despacho de grúas.</p>

              <div className="booking-points">
                <span><b>24/7</b> Cobertura de emergencias</span>
                <span><b>IX Región</b> Villarrica y alrededores</span>
                <span><b>Sin pagos online</b> Coordinación directa</span>
              </div>

              <div className="booking-emergency-box">
                <span className="emergency-title">¿Quedaste en pana ahora mismo?</span>
                <p>Para auxilio inmediato en ruta, llámanos directamente:</p>
                <a href="tel:+56991627809" className="emergency-phone-btn">
                  <Icon name="phone" />+56 9 9162 7809 <span>↗</span>
                </a>
              </div>
            </aside>

            {created ? (
              <div className="success booking-success" role="status">
                <span><Icon name="check" bare /></span>
                <h2>¡Solicitud enviada con éxito!</h2>
                <p>
                  Recibimos tu solicitud para <strong>{created.serviceName}</strong> con fecha <b>{created.scheduledDate}</b> a las <b>{created.timeSlot} hrs</b>
                  {selectedVehicle ? <> para tu <b>{selectedVehicle.brand} {selectedVehicle.model} ({formatPlate(selectedVehicle.plate)})</b></> : null}.
                </p>
                <div className="success-instruction">
                  <p>
                    Tu solicitud quedó <b>pendiente de confirmación</b>: el taller revisará la disponibilidad y te contactará para confirmarla.
                    {user ? <> Enviamos el detalle a <b>{user.email}</b>.</> : null}
                  </p>
                </div>
                <div className="success-actions">
                  <a className="button" href="/portal/citas">Ver mis citas <span>→</span></a>
                  <a className="button button-secondary" href="/">Volver al inicio</a>
                </div>
              </div>
            ) : authLoading ? (
              <div className="wide-form" aria-busy="true"><Skeleton label="Comprobando tu sesión…" rows={4} /></div>
            ) : !user ? (
              <div className="wide-form booking-gate" role="region" aria-label="Inicia sesión para agendar">
                <div className="form-heading">
                  <div>
                    <span>Inicia sesión para agendar</span>
                    <small>Para pedir una hora necesitas una cuenta con tu correo confirmado. Así el taller sabe quién eres y puedes seguir tu solicitud.</small>
                  </div>
                </div>
                <div className="success-actions">
                  <a className="button" href={`/login?redirect=${encodeURIComponent(`/agendar${typeof window === "undefined" ? "" : window.location.search}`)}`}>Iniciar sesión <span>→</span></a>
                  <a className="button button-secondary" href="/registro" onClick={() => rememberRedirect(`/agendar${window.location.search}`)}>Crear cuenta</a>
                </div>
                <p className="verify-hint">¿Es una emergencia? Para grúa o auxilio en ruta llámanos directo al <a href="tel:+56991627809"><b>+56 9 9162 7809</b></a>, 24/7.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="wide-form">
                <div className="form-heading">
                  <div>
                    <span>Paso 1: Tipo de atención</span>
                    <small>Selecciona la categoría que necesitas</small>
                  </div>
                </div>

                <div className="service-category">
                  <div className="service-category-tabs" role="tablist" aria-label="Tipo de servicio">
                    {(Object.keys(CATEGORY_INFO) as BookingCategory[]).map((option) => (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={category === option}
                        className={category === option ? "service-category-tab selected" : "service-category-tab"}
                        onClick={() => changeCategory(option)}
                        key={option}
                      >
                        <strong><Icon name={CATEGORY_INFO[option].icon} />{CATEGORY_INFO[option].label}</strong>
                        <small>{CATEGORY_INFO[option].description}</small>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-heading" style={{ marginTop: "12px" }}>
                  <div>
                    <span>Paso 2: Detalles del servicio y fecha</span>
                    <small>Elige el trabajo requerido y el día</small>
                  </div>
                </div>

                {servicesError && (
                  <p className="field-error" role="alert">
                    {servicesError}{" "}
                    <button type="button" className="toggle-btn" onClick={() => setServicesNonce((n) => n + 1)}>Reintentar</button>
                  </p>
                )}

                <div className="form-row">
                  <label>
                    Servicio específico *
                    <select value={serviceId} disabled={servicesLoading || availableServices.length === 0} onChange={(event) => setServiceId(event.target.value)}>
                      {servicesLoading && <option value="">Cargando servicios…</option>}
                      {availableServices.map((option) => (
                        <option key={option.id} value={option.id}>{option.name}</option>
                      ))}
                    </select>
                    {selectedService && <small className="service-hint"><Icon name="timer" />{serviceHint(selectedService)}</small>}
                  </label>

                  <label>
                    Fecha preferida *
                    <input
                      required
                      type="date"
                      min={today || undefined}
                      value={date}
                      onChange={(event) => {
                        setDate(event.target.value);
                        setTime("");
                        setTimeError(false);
                      }}
                    />
                  </label>
                </div>

                <fieldset className="schedule-fieldset">
                  <legend>Horario preferido *</legend>
                  <div className="schedule-heading">
                    <span>Selecciona el bloque de tu preferencia:</span>
                    <small>Sujeto a confirmación del taller</small>
                  </div>
                  <div className="time-slots" aria-busy={slotsLoading}>
                    {slotsLoading && <small>Consultando disponibilidad…</small>}
                    {!slotsLoading && slots.map((slot) => (
                      <button
                        type="button"
                        disabled={!slot.available}
                        title={slot.reason}
                        className={time === slot.time ? "time-slot selected" : "time-slot"}
                        aria-pressed={time === slot.time}
                        onClick={() => {
                          setTime(slot.time);
                          setTimeError(false);
                        }}
                        key={slot.time}
                      >
                        <span className="slot-hour">{slot.time}</span>
                        <small>{slotStatusLabel(slot)}</small>
                      </button>
                    ))}
                  </div>
                  {slotsError && (
                    <p className="field-error" role="alert">
                      {slotsError}{" "}
                      <button type="button" className="toggle-btn" onClick={refreshSlots}>Reintentar</button>
                    </p>
                  )}
                  {!slotsLoading && !slotsError && slots.length > 0 && slots.every((slot) => !slot.available) && (
                    <p className="service-hint">No quedan bloques disponibles para esta fecha. Prueba con otro día o llámanos al +56 9 9162 7809.</p>
                  )}
                  {timeError && (
                    <p className="field-error" role="alert"><Icon name="alert" />Por favor selecciona un bloque de horario para continuar.</p>
                  )}
                </fieldset>

                <div className="form-heading" style={{ marginTop: "12px" }}>
                  <div>
                    <span>Paso 3: Ubicación y detalles</span>
                    <small>Dónde te atendemos y qué necesitas</small>
                  </div>
                </div>

                <p className="booking-account">
                  <Icon name="user" />A nombre de <b>{user.name}</b> · {user.email}
                  {user.phone ? <> · <Icon name="phone" />{user.phone}</> : <small> (agrega tu teléfono en tu perfil para que el taller te llame)</small>}
                </p>

                {vehicles.length > 0 && (
                  <label>
                    <span><Icon name="car" />Vehículo guardado en tu cuenta (opcional)</span>
                    <select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}>
                      <option value="">Seleccionar vehículo o registrar otro...</option>
                      {vehicles.map((item) => (
                        <option key={item.id} value={item.id}>
                          {formatPlate(item.plate)} · {item.brand} {item.model}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label>
                  Lugar o dirección de atención *
                  <input required placeholder="Ej: Calle Prat 450, Villarrica (o punto de referencia en ruta)" value={location} onChange={(e) => setLocation(e.target.value)} />
                </label>

                <label>
                  Detalles adicionales de tu solicitud (opcional)
                  <textarea rows={2} placeholder="Ej: El auto no arranca, o requiero cambio de filtro además del aceite..." value={notes} onChange={(e) => setNotes(e.target.value)} />
                </label>

                {formError && <p className="field-error" role="alert"><Icon name="alert" />{formError}</p>}

                <button className="button button-submit" type="submit" disabled={submitting || servicesLoading || !selectedService}>
                  {submitting ? "Enviando solicitud…" : <>Confirmar y Solicitar Servicio <span>↗</span></>}
                </button>
              </form>
            )}
          </div>
        </section>
      </main>
      <InnerFooter />
    </>
  );
}
