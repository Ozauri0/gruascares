"use client";

import { FormEvent, useEffect, useState } from "react";
import InnerHeader from "../components/InnerHeader";
import InnerFooter from "../components/InnerFooter";
import { getAvailability } from "../lib/availability";
import { formatPlate } from "../lib/plate";
import type { PortalVehicle } from "../lib/portal-types";

const VEHICLES_KEY = "gruas-cares-vehicles";

type ServiceCategory = "gruas" | "serviteca";

const serviceGroups: Record<ServiceCategory, { label: string; description: string; options: string[] }> = {
  gruas: {
    label: "Grúa y Asistencia",
    description: "Rescate en ruta, traslado de vehículos y maquinaria pesada.",
    options: ["Grúa de plataforma hidráulica", "Transporte de cargas pesadas", "Camiones grúa", "Rescate vehicular"],
  },
  serviteca: {
    label: "Serviteca y Taller",
    description: "Mantenciones preventivas, cambio de aceite y frenos.",
    options: ["Cambio de aceite", "Cambio de neumáticos", "Mantenimiento general", "Revisión general de vehículo", "Mantención de camiones", "Mantención de autos", "Revisión preventiva"],
  },
};

const serviceDurations: Record<string, string> = {
  "Cambio de aceite": "45 min aprox.",
  "Cambio de neumáticos": "60 min aprox.",
  "Mantenimiento general": "120 min aprox.",
  "Revisión general de vehículo": "90 min aprox.",
  "Grúa de plataforma hidráulica": "Atención inmediata 24/7",
  "Transporte de cargas pesadas": "Coordinación técnica previa",
  "Camiones grúa": "Coordinación técnica previa",
  "Rescate vehicular": "Atención inmediata 24/7",
};

function getCategoryForService(service: string): ServiceCategory | null {
  if (serviceGroups.gruas.options.includes(service)) return "gruas";
  if (serviceGroups.serviteca.options.includes(service)) return "serviteca";
  return null;
}

export default function AgendarPage() {
  const [category, setCategory] = useState<ServiceCategory>("gruas");
  const [service, setService] = useState(serviceGroups.gruas.options[0]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [today, setToday] = useState("");
  const [timeError, setTimeError] = useState(false);
  const [sent, setSent] = useState(false);
  const [vehicles, setVehicles] = useState<PortalVehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("servicio");
    const initialCategory = initial ? getCategoryForService(initial) : null;
    if (initial && initialCategory) {
      setCategory(initialCategory);
      setService(initial);
    }
    const now = new Date();
    const localToday = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    setToday(localToday);
    // Preseleccionar hoy por defecto para agilizar al usuario
    if (!date) setDate(localToday);

    try {
      const saved = window.localStorage.getItem(VEHICLES_KEY);
      if (saved) setVehicles(JSON.parse(saved));
    } catch {
      // Sin vehículos guardados
    }
  }, []);

  function changeCategory(nextCategory: ServiceCategory) {
    setCategory(nextCategory);
    setService(serviceGroups[nextCategory].options[0]);
    setTime("");
    setTimeError(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!time) {
      setTimeError(true);
      return;
    }
    setSent(true);
  }

  const availableServices = serviceGroups[category].options;
  const slots = getAvailability(date);
  const selectedVehicle = vehicles.find((item) => item.id === vehicleId);

  return (
    <>
      <InnerHeader />
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
                  📞 +56 9 9162 7809 <span>↗</span>
                </a>
              </div>
            </aside>

            {sent ? (
              <div className="success booking-success">
                <span>✓</span>
                <h2>¡Solicitud enviada con éxito!</h2>
                <p>
                  Recibimos tu solicitud para <strong>{service}</strong> con fecha <b>{date}</b> a las <b>{time} hrs</b>
                  {selectedVehicle ? <> para tu <b>{selectedVehicle.brand} {selectedVehicle.model} ({formatPlate(selectedVehicle.plate)})</b></> : null}.
                </p>
                <div className="success-instruction">
                  <p>Te contactaremos a la brevedad a tu número de teléfono para confirmar la llegada del móvil o el ingreso al taller.</p>
                </div>
                <div className="success-actions">
                  <a className="button" href="/portal">Ir a mi portal de citas <span>→</span></a>
                  <a className="button button-secondary" href="/">Volver al inicio</a>
                </div>
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
                    {(Object.keys(serviceGroups) as ServiceCategory[]).map((option) => (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={category === option}
                        className={category === option ? "service-category-tab selected" : "service-category-tab"}
                        onClick={() => changeCategory(option)}
                        key={option}
                      >
                        <strong>{option === "gruas" ? "🚨 " : "🔧 "}{serviceGroups[option].label}</strong>
                        <small>{serviceGroups[option].description}</small>
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

                <div className="form-row">
                  <label>
                    Servicio específico *
                    <select value={service} onChange={(event) => setService(event.target.value)}>
                      {availableServices.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                    {serviceDurations[service] && (
                      <small className="service-hint">⏱️ {serviceDurations[service]}</small>
                    )}
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
                  <div className="time-slots">
                    {slots.map((slot) => (
                      <button
                        type="button"
                        disabled={!slot.available}
                        className={time === slot.time ? "time-slot selected" : "time-slot"}
                        aria-pressed={time === slot.time}
                        onClick={() => {
                          setTime(slot.time);
                          setTimeError(false);
                        }}
                        key={slot.time}
                      >
                        <span className="slot-hour">{slot.time}</span>
                        <small>{slot.available ? "Disponible" : "Ocupado"}</small>
                      </button>
                    ))}
                  </div>
                  {timeError && (
                    <p className="field-error" role="alert">⚠️ Por favor selecciona un bloque de horario para continuar.</p>
                  )}
                </fieldset>

                <div className="form-heading" style={{ marginTop: "12px" }}>
                  <div>
                    <span>Paso 3: Tus datos de contacto y ubicación</span>
                    <small>Para coordinar contigo y acudir al lugar</small>
                  </div>
                </div>

                <div className="form-row">
                  <label>
                    Nombre y apellido *
                    <input required placeholder="Ej: Juan Pérez" />
                  </label>
                  <label>
                    Teléfono de contacto *
                    <input required type="tel" placeholder="+56 9 1234 5678" />
                  </label>
                </div>

                {vehicles.length > 0 && (
                  <label>
                    🚗 Vehículo guardado en tu cuenta (opcional)
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
                  <input required placeholder="Ej: Calle Prat 450, Villarrica (o punto de referencia en ruta)" />
                </label>

                <label>
                  Detalles adicionales de tu solicitud (opcional)
                  <textarea rows={2} placeholder="Ej: El auto no arranca, o requiero cambio de filtro además del aceite..." />
                </label>

                <button className="button button-submit" type="submit">
                  Confirmar y Solicitar Servicio <span>↗</span>
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
