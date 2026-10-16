"use client";

import InnerFooter from "../components/InnerFooter";
import InnerHeader from "../components/InnerHeader";
import AddToCartButton from "../components/AddToCartButton";
import { useSiteContent } from "../components/SiteContentProvider";
import { RichText } from "../components/RichText";
import { formatPrice } from "../lib/catalog";
import { usePublicCatalog } from "../lib/use-catalog";

export default function CatalogoPage() {
  const { products, loading, error, reload } = usePublicCatalog();
  const t = useSiteContent();
  const intro = <section className="page-intro wrap"><p className="eyebrow">{t("shop.eyebrow")}</p><h1><RichText value={t("shop.title")} /></h1><p>{t("shop.text")}</p></section>;
  const featured = products.filter((item) => item.featured);
  const more = products.filter((item) => !item.featured);

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

  return <><InnerHeader /><main className="inner-page catalog-page">{intro}<section className="featured-section"><div className="wrap"><div className="section-head"><div><p className="eyebrow">Los más solicitados</p><h2>Top ventas</h2></div><span className="catalog-count">{String(featured.length).padStart(2, "0")} productos destacados</span></div><div className="featured-grid">{featured.map((item) => <article className="featured-product" key={item.id}><div className={`featured-photo product-art ${item.art}`}>{item.image ? <img src={item.image} alt={item.name} loading="lazy" /> : <i />}<span>{item.tag}</span></div><div className="product-copy"><div className="stock"><i /> {item.stock} disponibles</div><h3>{item.name}</h3><p>{item.text}</p><strong className="product-price">{formatPrice(item.price)}</strong><AddToCartButton id={item.id} name={item.name} price={formatPrice(item.price)} type={item.art} /></div></article>)}</div></div></section><section className="all-services wrap"><div className="section-head"><div><p className="eyebrow">Catálogo completo</p><h2>También tenemos<br /><em>lo que necesitas.</em></h2></div><p className="section-note">Productos para mantener tu vehículo listo para la ruta. <small className="stock-note">Precios y stock referenciales del mockup.</small></p></div><div className="service-list products-list">{more.map((item) => <article className="service-list-item product-row" key={item.id}><div className={`mini-product-art product-art ${item.art}`}>{item.image ? <img src={item.image} alt="" loading="lazy" /> : <i />}</div><span className="list-product-copy"><small>{item.category}</small><strong>{item.name}</strong><em>{item.text}</em></span><div className="product-row-meta"><strong>{formatPrice(item.price)}</strong><span className="list-stock"><i /> {item.stock} disponibles</span></div><AddToCartButton id={item.id} name={item.name} price={formatPrice(item.price)} type={item.art} /></article>)}</div></section></main><InnerFooter /></>;
}
