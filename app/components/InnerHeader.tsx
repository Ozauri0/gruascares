"use client";

import { useState } from "react";
import CartLink from "./CartLink";

export default function InnerHeader() {
  const [open, setOpen] = useState(false);
  return <>
    <div className="topbar inner-topbar"><span><i className="live-dot" /> Atención de emergencias 24/7</span><span className="top-location">Villarrica · IX Región</span><a href="tel:+56991627809">+56 9 9162 7809 <b>↗</b></a></div>
    <nav className="nav wrap inner-nav"><a className="brand" href="/"><img src="/images/logo.png" alt="Grúas Cares" /></a><div className={"nav-links " + (open ? "open" : "")}><a href="/#nosotros" onClick={() => setOpen(false)}>Nosotros</a><a href="/#servicios" onClick={() => setOpen(false)}>Servicios</a><a href="/catalogo" onClick={() => setOpen(false)}>Catálogo</a><a href="/#contacto" onClick={() => setOpen(false)}>Contacto</a><a href="/login" onClick={() => setOpen(false)}>Portal</a></div><CartLink /><a className="nav-cta" href="/agendar">Agendar servicio <span>↗</span></a><button className="menu-btn" onClick={() => setOpen(!open)} aria-label="Abrir menú">☰</button></nav>
  </>;
}
