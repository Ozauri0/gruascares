"use client";

import { FormEvent, useEffect, useState } from "react";
import InnerHeader from "../components/InnerHeader";
import { getAvailability } from "../lib/availability";
import { formatPlate } from "../lib/plate";
import type { PortalVehicle } from "../lib/portal-types";

const VEHICLES_KEY = "gruas-cares-vehicles";

type ServiceCategory = "gruas" | "serviteca";

const serviceGroups: Record<ServiceCategory, { label: string; description: string; options: string[] }> = {
  gruas: {
    label: "Grúas",
    description: "Rescate, traslado y transporte de cargas.",
    options: ["Grúa de plataforma hidráulica", "Transporte de cargas pesadas", "Camiones grúa", "Rescate vehicular"],
  },
  serviteca: {
    label: "Serviteca",
    description: "Mantención preventiva y cuidado para tu vehículo.",
    options: ["Cambio de aceite", "Cambio de neumáticos", "Mantenimiento general", "Revisión general de vehículo", "Mantención de camiones", "Mantención de autos", "Revisión preventiva"],
  },
};

// Bloques base del taller y ocupación: ver app/lib/availability.ts (futura API T1.5).
const serviceDurations: Record<string, string> = {
  "Cambio de aceite": "45 min aprox.",
  "Cambio de neumáticos": "60 min aprox.",
  "Mantenimiento general": "120 min aprox.",
  "Revisión general de vehículo": "90 min aprox.",
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
    try {
      const saved = window.localStorage.getItem(VEHICLES_KEY);
      if (saved) setVehicles(JSON.parse(saved));
    } catch {
      // Sin vehículos guardados: se agenda como visita sin registro previo.
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

  return <><InnerHeader /><main className="inner-page booking-page"><section className="booking-intro wrap"><div><p className="eyebrow">Agenda Cares</p><h1>Coordinemos<br /><em>tu servicio.</em></h1></div><p>Cuéntanos qué necesitas y encontraremos el mejor momento para atenderte en Villarrica y alrededores.</p></section><section className="booking-form-section"><div className="wrap booking-form-layout"><aside><p className="aside-kicker">Atención directa</p><h2>Hagámoslo<br /><em>simple.</em></h2><p>Elige entre servicios de grúa o serviteca y déjanos tus datos. Nuestro equipo revisará tu solicitud para coordinar los detalles.</p><div className="booking-points"><span><b>24/7</b> Emergencias</span><span><b>IX</b> Región de atención</span></div><a href="tel:+56991627809">Para emergencias, llámanos ↗</a></aside>{sent ? <div className="success booking-success"><span>✓</span><h2>Solicitud recibida</h2><p>Recibimos tu preferencia de <strong>{serviceGroups[category].label}: {service}</strong> para las {date} a las {time}{selectedVehicle ? <> para tu {selectedVehicle.brand} {selectedVehicle.model} ({formatPlate(selectedVehicle.plate)})</> : null}. Te contactaremos para confirmar disponibilidad.</p><a className="button" href="/">Volver al inicio <span>↗</span></a></div> : <form onSubmit={submit} className="wide-form"><div className="form-heading"><span>Datos del servicio</span><small>Todos los campos son editables</small></div><div className="service-category"><span className="field-label">Tipo de servicio</span><div className="service-category-tabs" role="tablist" aria-label="Tipo de servicio">{(Object.keys(serviceGroups) as ServiceCategory[]).map((option) => <button type="button" role="tab" aria-selected={category === option} className={category === option ? "service-category-tab selected" : "service-category-tab"} onClick={() => changeCategory(option)} key={option}><strong>{serviceGroups[option].label}</strong><small>{serviceGroups[option].description}</small></button>)}</div></div><div className="form-row"><label>Nombre completo<input required placeholder="Tu nombre" /></label><label>Teléfono<input required type="tel" placeholder="+56 9 ..." /></label></div><div className="form-row"><label>Servicio<select value={service} onChange={(event) => setService(event.target.value)}>{availableServices.map((option) => <option key={option}>{option}</option>)}</select>{serviceDurations[service] && <small className="service-hint">Duración referencial: {serviceDurations[service]}</small>}</label><label>Fecha preferida<input required type="date" min={today || undefined} value={date} onChange={(event) => { setDate(event.target.value); setTime(""); setTimeError(false); }} /></label></div>{vehicles.length > 0 && <label>Vehículo registrado<select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}><option value="">Otro / aún no registrado</option>{vehicles.map((item) => <option key={item.id} value={item.id}>{formatPlate(item.plate)} · {item.brand} {item.model}</option>)}</select><small className="service-hint">Si tienes tus vehículos en el portal, elige uno para agilizar la atención.</small></label>}<fieldset className="schedule-fieldset"><legend>Horario preferido</legend><div className="schedule-heading"><span>Selecciona un bloque disponible</span><small>Referencial, sujeto a confirmación</small></div><div className="time-slots">{slots.map((slot) => <button type="button" disabled={!slot.available} className={time === slot.time ? "time-slot selected" : "time-slot"} aria-pressed={time === slot.time} onClick={() => { setTime(slot.time); setTimeError(false); }} key={slot.time}>{slot.time}<small>{slot.available ? "Disponible" : "Ocupado"}</small></button>)}</div>{timeError && <p className="field-error" role="alert">Selecciona un horario para continuar.</p>}</fieldset><label>Dirección o lugar del servicio<input required placeholder="Villarrica, dirección o referencia" /></label><label>Cuéntanos más<textarea rows={2} placeholder="Detalles de tu solicitud" /></label><button className="button" type="submit">Enviar solicitud <span>↗</span></button></form>}</div></section></main></>;
}
