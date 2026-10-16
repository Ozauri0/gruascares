"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import InnerFooter from "../../components/InnerFooter";
import InnerHeader from "../../components/InnerHeader";
import AdminNav from "../components/AdminNav";
import { discardDraft, fetchDraft, publishDraft } from "../../lib/admin-api";
import { ALL_FIELDS } from "../../lib/site-content";

export default function ContentAdminPage() {
  const [pending, setPending] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"" | "publish" | "discard">("");

  const load = useCallback(() => {
    setError("");
    fetchDraft()
      .then(({ draft }) => setPending(Object.keys(draft)))
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar el borrador."));
  }, []);
  useEffect(load, [load]);

  async function act(kind: "publish" | "discard") {
    if (busy) return;
    setBusy(true);
    setConfirm("");
    setNotice("");
    try {
      if (kind === "publish") await publishDraft();
      else await discardDraft();
      setNotice(kind === "publish" ? "Publicado: el sitio público ya muestra los cambios." : "Borrador descartado.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la acción.");
    } finally {
      setBusy(false);
    }
  }

  const labels = (pending ?? []).map((key) => ALL_FIELDS.find((f) => f.key === key)?.label ?? key);

  return (
    <>
      <InnerHeader />
      <main className="inner-page portal-page">
        <section className="page-intro wrap portal-intro">
          <div>
            <p className="eyebrow">Administración</p>
            <h1>Contenido del <em>sitio.</em></h1>
          </div>
          <div>
            <p className="portal-subtext">Edita la web pública directamente sobre la página, como en WordPress. Lo que guardes queda como borrador: el público no lo ve hasta que lo publiques.</p>
          </div>
        </section>

        <div className="portal-stack wrap">
          <AdminNav current="contenido" />

          {error && <div className="portal-empty-card" role="alert"><p>{error}</p><button type="button" className="button button-sm" onClick={load}>Reintentar</button></div>}
          {notice && <p className="portal-badge-active" role="status">{notice}</p>}

          <section className="ed-launch" aria-label="Editar páginas">
            <h2>Entrar en modo edición</h2>
            <p>También puedes entrar desde cualquier página pública con el botón <strong>✏️ Editar página</strong> (visible solo para administradores).</p>
            <div className="ed-launch-actions">
              <Link className="button" href="/?editar=1">Editar Inicio <span>↗</span></Link>
              <Link className="button" href="/catalogo?editar=1">Editar Tienda <span>↗</span></Link>
            </div>
          </section>

          <section className="ed-launch" aria-label="Borrador">
            <h2>Borrador sin publicar</h2>
            {pending === null && !error ? (
              <p aria-busy="true">Cargando…</p>
            ) : pending && pending.length === 0 ? (
              <p>No hay cambios pendientes: el sitio público muestra lo último publicado.</p>
            ) : pending ? (
              <>
                <p>{pending.length} campo(s) con cambios guardados que el público aún no ve:</p>
                <ul className="ed-pending">{labels.map((label, i) => <li key={`${label}-${i}`}>{label}</li>)}</ul>
                <div className="ed-launch-actions">
                  {confirm === "publish" ? (
                    <button type="button" className="toggle-btn active" disabled={busy} onClick={() => void act("publish")} onBlur={() => setConfirm("")} autoFocus>Confirmar: se verá públicamente</button>
                  ) : (
                    <button type="button" className="toggle-btn active" disabled={busy} onClick={() => setConfirm("publish")}>Publicar todo</button>
                  )}
                  {confirm === "discard" ? (
                    <button type="button" className="toggle-btn danger confirm" disabled={busy} onClick={() => void act("discard")} onBlur={() => setConfirm("")} autoFocus>¿Descartar todo?</button>
                  ) : (
                    <button type="button" className="toggle-btn" disabled={busy} onClick={() => setConfirm("discard")}>Descartar borrador</button>
                  )}
                </div>
              </>
            ) : null}
          </section>
        </div>
      </main>
      <InnerFooter />
    </>
  );
}
