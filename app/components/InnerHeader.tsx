"use client";

import { useState } from "react";
import CartLink from "./CartLink";
import NavUser from "./NavUser";
import { useSiteContent } from "./SiteContentProvider";

export default function InnerHeader() {
  const [open, setOpen] = useState(false);
  const t = useSiteContent();
  return <>
    <div className="topbar inner-topbar"><span><i className="live-dot" /> {t("topbar.text")}</span><span className="top-location">{t("topbar.location")}</span><a href="tel:+56991627809">+56 9 9162 7809 <b>↗</b></a></div>
    <nav className="nav wrap inner-nav"><a className="brand" href="/"><img src={t("site.logo.image")} alt="Grúas Cares" /></a><div className={"nav-links " + (open ? "open" : "")}><a href="/#nosotros" onClick={() => setOpen(false)}>Nosotros</a><a href="/#servicios" onClick={() => setOpen(false)}>Servicios</a><a href="/catalogo" onClick={() => setOpen(false)}>Catálogo</a><a href="/#contacto" onClick={() => setOpen(false)}>Contacto</a></div><CartLink /><NavUser /><a className="nav-cta" href="/agendar">Agendar servicio <span>↗</span></a><button className="menu-btn" onClick={() => setOpen(!open)} aria-label="Abrir menú">☰</button></nav>
  </>;
}
