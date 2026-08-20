"use client";

import { FormEvent, useEffect, useState } from "react";
import InnerHeader from "../components/InnerHeader";

const options = ["Grúa de plataforma hidráulica", "Transporte de cargas pesadas", "Camiones grúa", "Mantención de camiones", "Mantención de autos", "Rescate vehicular", "Neumáticos para camión", "Aceite de motor", "Baterías", "Filtros de aceite y aire", "Pastillas de freno", "Refrigerante", "Kit de emergencia", "Accesorios para carga", "Revisión preventiva"];

export default function AgendarPage() {
  const [service, setService] = useState(options[0]);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("servicio");
    if (initial && options.includes(initial)) setService(initial);
  }, []);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSent(true); }
  return <><InnerHeader /><main className="inner-page booking-page"><section className="booking-intro wrap"><div><p className="eyebrow">Agenda Cares</p><h1>Coordinemos<br /><em>tu servicio.</em></h1></div><p>Cuéntanos qué necesitas y encontraremos el mejor momento para atenderte en Villarrica y alrededores.</p></section><section className="booking-form-section"><div className="wrap booking-form-layout"><aside><p className="aside-kicker">Atención directa</p><h2>Hagámoslo<br /><em>simple.</em></h2><p>Selecciona un servicio y déjanos tus datos. Nuestro equipo revisará tu solicitud para coordinar los detalles.</p><div className="booking-points"><span><b>24/7</b> Emergencias</span><span><b>IX</b> Región de atención</span></div><a href="tel:+56991627809">Para emergencias, llámanos ↗</a></aside>{sent ? <div className="success booking-success"><span>✓</span><h2>Solicitud recibida</h2><p>Te contactaremos para confirmar los detalles de tu servicio.</p><a className="button" href="/">Volver al inicio <span>↗</span></a></div> : <form onSubmit={submit} className="wide-form"><div className="form-heading"><span>Datos del servicio</span><small>Todos los campos son editables</small></div><div className="form-row"><label>Nombre completo<input required placeholder="Tu nombre" /></label><label>Teléfono<input required type="tel" placeholder="+56 9 ..." /></label></div><div className="form-row"><label>Servicio<select value={service} onChange={(e) => setService(e.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></label><label>Fecha preferida<input required type="date" /></label></div><label>Dirección o lugar del servicio<input required placeholder="Villarrica, dirección o referencia" /></label><label>Cuéntanos más<textarea rows={2} placeholder="Detalles de tu solicitud" /></label><button className="button" type="submit">Enviar solicitud <span>↗</span></button></form>}</div></section></main></>;
}
