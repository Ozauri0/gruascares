"use client";

import AreaNav from "../../components/AreaNav";
import CranesPanel from "../../components/CranesPanel";
import InnerFooter from "../../components/InnerFooter";
import LogoutButton from "../../components/LogoutButton";

export default function FleetPage() {
  return (
    <>
      <main className="inner-page portal-page">
        <section className="page-intro wrap portal-intro">
          <div>
            <p className="eyebrow">Grúas</p>
            <h1>Flota de <em>grúas.</em></h1>
          </div>
          <div>
            <LogoutButton />
          </div>
        </section>
        <div className="portal-stack wrap">
          <AreaNav />
          <CranesPanel />
        </div>
      </main>
      <InnerFooter />
    </>
  );
}
