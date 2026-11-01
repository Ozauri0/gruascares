"use client";

import Link from "next/link";
import InnerFooter from "../components/InnerFooter";
import AreaNav from "../components/AreaNav";
import LogoutButton from "../components/LogoutButton";
import { firstName, useAuth } from "../lib/auth";
import { formatPrice } from "../lib/catalog";
import { useAdminCatalog } from "../lib/use-catalog";
import Skeleton from "../components/Skeleton";

const LOW_STOCK = 5;

// Inicio del vendedor: resumen del catálogo y accesos a lo que gestiona.
export default function SellerHomePage() {
  const { user, loading: authLoading } = useAuth();
  const { products, loading, error, reload } = useAdminCatalog();
  const active = products.filter((p) => p.active);
  const outOfStock = active.filter((p) => p.stock === 0);
  const lowStock = active.filter((p) => p.stock > 0 && p.stock <= LOW_STOCK);
  const attention = [...outOfStock, ...lowStock];

  return (
    <>
      <main className="inner-page portal-page">
        <section className="page-intro wrap portal-intro">
          <div>
            <p className="eyebrow">Ventas</p>
            <h1>Hola{user ? `, ${firstName(user.name)}` : authLoading ? <>, <span className="skeleton skeleton-inline" aria-hidden="true" /></> : ""}<em>.</em></h1>
          </div>
          <div>
            <p className="portal-subtext">Tu resumen del catálogo: qué está a la venta, qué se está acabando y a dónde ir para actualizarlo.</p>
            <LogoutButton />
          </div>
        </section>

        <div className="portal-stack wrap">
          <AreaNav />
          {loading ? (
            <Skeleton label="Cargando el catálogo…" kpis />
          ) : error ? (
            <div className="portal-empty-card" role="alert">
              <p>{error}</p>
              <button type="button" className="button button-sm" onClick={reload}>Reintentar</button>
            </div>
          ) : (
            <>
              <section className="kpi-grid" aria-label="Resumen del catálogo">
                <div className="kpi-card kpi-dark"><strong>{active.length}</strong><span>Productos a la venta</span></div>
                <div className="kpi-card"><strong>{products.length - active.length}</strong><span>Ocultos de la tienda</span></div>
                <div className="kpi-card"><strong>{lowStock.length}</strong><span>Con poco stock (≤ {LOW_STOCK})</span></div>
                <div className="kpi-card"><strong>{outOfStock.length}</strong><span>Agotados</span></div>
              </section>

              <section aria-label="Accesos">
                <div className="portal-row-head"><h2>¿Qué quieres hacer?</h2></div>
                <div className="seller-actions">
                  <Link className="button" href="/vendedor/catalogo">Gestionar catálogo y precios <span>↗</span></Link>
                  <Link className="button" href="/atencion-presencial">Atención presencial por RUT <span>↗</span></Link>
                  <Link className="toggle-btn" href="/catalogo">Ver la tienda como la ve el público</Link>
                  <Link className="toggle-btn" href="/portal">Mi cuenta</Link>
                </div>
              </section>

              <section aria-label="Productos por reponer">
                <div className="portal-row-head">
                  <h2>Por reponer</h2>
                  <span className="catalog-count">{attention.length} {attention.length === 1 ? "producto" : "productos"}</span>
                </div>
                {attention.length === 0 ? (
                  <div className="portal-empty-card"><p>Todo el catálogo tiene stock suficiente.</p></div>
                ) : (
                  <div className="demand-card">
                    {attention.map((p) => (
                      <div className="demand-row" key={p.id}>
                        <div className="demand-label"><strong>{p.name}</strong><span>{formatPrice(p.price)}</span></div>
                        <span className={p.stock === 0 ? "role-badge role-admin" : "role-badge role-vendedor"}>{p.stock === 0 ? "Agotado" : `${p.stock} en stock`}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>
      <InnerFooter />
    </>
  );
}
