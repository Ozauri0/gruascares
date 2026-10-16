"use client";

import { useEffect, useState } from "react";
import InnerFooter from "../components/InnerFooter";
import InnerHeader from "../components/InnerHeader";
import AddToCartButton from "../components/AddToCartButton";
import { useSiteContent } from "../components/SiteContentProvider";
import { RichText } from "../components/RichText";
import { formatPrice } from "../lib/catalog";
import { SHOP_TOP_HIDDEN_KEY } from "../lib/site-content";
import { usePublicCatalog } from "../lib/use-catalog";

type View = "grid" | "list";
const VIEW_KEY = "gruas-cares-catalog-view";

export default function CatalogoPage() {
  const [view, setView] = useState<View>("grid");
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_KEY);
      if (stored === "grid" || stored === "list") setView(stored);
    } catch {
      /* sin almacenamiento: queda la cuadrícula */
    }
  }, []);
  function changeView(next: View) {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* preferencia no persistente */
    }
  }

  const { products: allProducts, loading, error, reload } = usePublicCatalog();
  const products = allProducts.filter((item) => item.stock > 0); // solo se muestra lo disponible
  const t = useSiteContent();
  const intro = <section className="page-intro wrap"><p className="eyebrow">{t("shop.eyebrow")}</p><h1><RichText value={t("shop.title")} /></h1><p>{t("shop.text")}</p></section>;
  // Con la sección oculta, los productos destacados siguen estando en el catálogo completo.
  const topHidden = t(SHOP_TOP_HIDDEN_KEY) === "1";
  const featured = topHidden ? [] : products.filter((item) => item.featured);
  const more = topHidden ? products : products.filter((item) => !item.featured);

  if (loading || error) {
    return (
      <>
        <InnerHeader />
        <main className="inner-page catalog-page">
          {intro}
          <section className="wrap" style={{ paddingBottom: 90 }}>
            {loading ? (
              <div className="portal-empty-card" aria-busy="true"><p>Cargando el catálogo…</p></div>
            ) : (
              <div className="portal-empty-card" role="alert">
                <p>{error}</p>
                <button type="button" className="button button-sm" onClick={reload}>Reintentar</button>
              </div>
            )}
          </section>
        </main>
        <InnerFooter />
      </>
    );
  }

  return <><InnerHeader /><main className={`inner-page catalog-page view-${view}`}>{intro}<div className="wrap catalog-toolbar"><span className="catalog-count">{products.length} productos disponibles</span><div className="view-toggle" role="group" aria-label="Vista del catálogo"><button type="button" aria-pressed={view === "grid"} className={view === "grid" ? "on" : ""} onClick={() => changeView("grid")}><svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M2 2h7v7H2zM11 2h7v7h-7zM2 11h7v7H2zM11 11h7v7h-7z" fill="currentColor" /></svg> Cuadrícula</button><button type="button" aria-pressed={view === "list"} className={view === "list" ? "on" : ""} onClick={() => changeView("list")}><svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M2 3h16v4H2zM2 9h16v4H2zM2 15h16v3H2z" fill="currentColor" /></svg> Filas</button></div></div>{featured.length > 0 && <section className="featured-section"><div className="wrap"><div className="section-head"><div><p className="eyebrow">Los más solicitados</p><h2>Top ventas</h2></div><span className="catalog-count">{String(featured.length).padStart(2, "0")} productos destacados</span></div><div className="featured-grid">{featured.map((item) => <article className="featured-product" key={item.id}><div className={`featured-photo product-art ${item.art}`}>{item.image ? <img src={item.image} alt={item.name} loading="lazy" /> : <i />}<span>{item.tag}</span></div><div className="product-copy"><div className="stock"><i /> {item.stock} disponibles</div><h3>{item.name}</h3><p>{item.text}</p><strong className="product-price">{formatPrice(item.price)}</strong><AddToCartButton id={item.id} name={item.name} price={formatPrice(item.price)} type={item.art} image={item.image} /></div></article>)}</div></div></section>}<section className="all-services wrap"><div className="section-head"><div><p className="eyebrow">Catálogo completo</p><h2>También tenemos<br /><em>lo que necesitas.</em></h2></div><p className="section-note">Productos para mantener tu vehículo listo para la ruta. <small className="stock-note">Precios y stock referenciales del mockup. <a href="/creditos">Créditos de las fotos</a>.</small></p></div><div className="service-list products-list">{more.map((item) => <article className="service-list-item product-row" key={item.id}><div className={`mini-product-art product-art ${item.art}`}>{item.image ? <img src={item.image} alt="" loading="lazy" /> : <i />}</div><span className="list-product-copy"><small>{item.category}</small><strong>{item.name}</strong><em>{item.text}</em></span><div className="product-row-meta"><strong>{formatPrice(item.price)}</strong><span className="list-stock"><i /> {item.stock} disponibles</span></div><AddToCartButton id={item.id} name={item.name} price={formatPrice(item.price)} type={item.art} image={item.image} /></article>)}</div></section></main><InnerFooter /></>;
}
