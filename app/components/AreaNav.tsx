"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../lib/auth";
import { AREA_LABEL, HOME_FOR_ROLE, areasFor, type Role } from "../lib/route-guard";

const AREA_ICON: Record<Role, string> = { admin: "🛠️", mecanico: "🔧", vendedor: "🏷️", usuario: "👤" };

/** Barra para moverse entre las áreas a las que tiene acceso quien trabaja en la empresa (no se muestra a un cliente). */
export default function AreaNav() {
  const { user } = useAuth();
  const pathname = usePathname();
  if (!user) return null;
  const areas = areasFor(user);
  if (areas.length < 2) return null;
  const current = areas.find((area) => pathname === HOME_FOR_ROLE[area] || pathname.startsWith(`${HOME_FOR_ROLE[area]}/`)) ?? null;
  return (
    <nav className="area-nav" aria-label="Áreas de trabajo">
      <span className="area-nav-label">Mis áreas</span>
      {areas.map((area) => (
        <Link key={area} href={HOME_FOR_ROLE[area]} className={`area-nav-link${area === current ? " active" : ""}`} aria-current={area === current ? "page" : undefined}>
          <span aria-hidden="true">{AREA_ICON[area]}</span> {AREA_LABEL[area]}
        </Link>
      ))}
    </nav>
  );
}
