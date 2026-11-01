"use client";

import Link from "next/link";
import { useState } from "react";
import CartLink from "./CartLink";
import NavUser from "./NavUser";
import { useSiteContent } from "./SiteContentProvider";
import Icon from "./Icon";
import ThemeToggle from "./ThemeToggle";

export default function InnerHeader() {
  const [open, setOpen] = useState(false);
  const t = useSiteContent();
  return <>
    <div className="topbar inner-topbar"><span><i className="live-dot" /> {t("topbar.text")}</span><span className="top-location">{t("topbar.location")}</span><a href="tel:+56991627809">+56 9 9162 7809 <b>↗</b></a></div>
    <nav className="nav wrap inner-nav"><Link className="brand" href="/"><img src={t("site.logo.image")} alt="Grúas Cares" /></Link><div className={"nav-links " + (open ? "open" : "")}><Link href="/#nosotros" onClick={() => setOpen(false)}>Nosotros</Link><Link href="/#servicios" onClick={() => setOpen(false)}>Servicios</Link><Link href="/catalogo" onClick={() => setOpen(false)}>Catálogo</Link><Link href="/team-cares" onClick={() => setOpen(false)}>Team Cares</Link><Link href="/#contacto" onClick={() => setOpen(false)}>Contacto</Link></div><CartLink /><NavUser /><ThemeToggle /><Link className="nav-cta" href="/agendar">Agendar servicio <span>↗</span></Link><button className="menu-btn" onClick={() => setOpen(!open)} aria-label="Abrir menú"><Icon name="menu" bare /></button></nav>
  </>;
}
