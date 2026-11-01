"use client";

import AreaNav from "../components/AreaNav";
import InnerFooter from "../components/InnerFooter";
import LogoutButton from "../components/LogoutButton";
import Skeleton from "../components/Skeleton";
import WorkersPanel from "../components/WorkersPanel";
import { useAuth } from "../lib/auth";
import { rolesOf } from "../lib/route-guard";
import type { WorkArea } from "../lib/work-areas";

/** Áreas cuyo personal puede gestionar esta cuenta: el jefe de taller, serviteca; el de grúas, grúas; el admin, ambas. */
function managedAreas(roles: string[]): WorkArea[] {
  const admin = roles.includes("admin");
  const areas: WorkArea[] = [];
  if (admin || roles.includes("mecanico")) areas.push("serviteca");
  if (admin || roles.includes("grua")) areas.push("grua");
  return areas;
}

export default function PersonalPage() {
  const { user } = useAuth();
  const areas = user ? managedAreas(rolesOf(user)) : [];
  return (
    <>
      <main className="inner-page portal-page">
        <section className="page-intro wrap portal-intro">
          <div>
            <p className="eyebrow">Equipo de trabajo</p>
            <h1>Gestionar <em>personal.</em></h1>
          </div>
          <div>
            <LogoutButton />
          </div>
        </section>
        <div className="portal-stack wrap">
          <AreaNav />
          {!user ? <Skeleton label="Cargando…" rows={2} /> : areas.map((area) => <WorkersPanel key={area} area={area} defaultOpen />)}
        </div>
      </main>
      <InnerFooter />
    </>
  );
}
