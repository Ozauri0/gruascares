"use client";

import { useEffect, useState } from "react";
import InnerFooter from "../components/InnerFooter";
import InnerHeader from "../components/InnerHeader";
import AddToCartButton from "../components/AddToCartButton";
import { DEFAULT_PRODUCTS, formatPrice, loadCatalog } from "../lib/catalog";
import type { Product } from "../lib/catalog";

export default function CatalogoPage() {
  const [products, setProducts] = useState<Product[]>(DEFAULT_PRODUCTS);

  useEffect(() => {
    setProducts(loadCatalog().filter((item) => item.active));
  }, []);

  const featured = products.filter((item) => item.featured);
  const more = products.filter((item) => !item.featured);

  return <><InnerHeader /><main className="inner-page catalog-page"><section className="page-intro wrap"><p className="eyebrow">Tienda Cares</p><h1>Todo para<br /><em>seguir en ruta.</em></h1><p>Productos e insumos para el cuidado, seguridad y mantenimiento de autos, camiones y maquinaria.</p></section><section className="featured-section"><div className="wrap"><div className="section-head"><div><p className="eyebrow">Los más solicitados</p><h2>Top ventas</h2></div><span className="catalog-count">{String(featured.length).padStart(2, "0")} productos destacados</span></div><div className="featured-grid">{featured.map((item) => <article className="featured-product" key={item.id}><div className={`featured-photo product-art ${item.art}`}>{item.image ? <img src={item.image} alt={item.name} loading="lazy" /> : <i />}<span>{item.tag}</span></div><div className="product-copy"><div className="stock"><i /> {item.stock} disponibles</div><h3>{item.name}</h3><p>{item.text}</p><strong className="product-price">{formatPrice(item.price)}</strong><AddToCartButton id={item.id} name={item.name} price={formatPrice(item.price)} type={item.art} /></div></article>)}</div></div></section><section className="all-services wrap"><div className="section-head"><div><p className="eyebrow">Catálogo completo</p><h2>También tenemos<br /><em>lo que necesitas.</em></h2></div><p className="section-note">Productos para mantener tu vehículo listo para la ruta. <small className="stock-note">Precios y stock referenciales del mockup.</small></p></div><div className="service-list products-list">{more.map((item) => <article className="service-list-item product-row" key={item.id}><div className={`mini-product-art product-art ${item.art}`}>{item.image ? <img src={item.image} alt="" loading="lazy" /> : <i />}</div><span className="list-product-copy"><small>{item.category}</small><strong>{item.name}</strong><em>{item.text}</em></span><div className="product-row-meta"><strong>{formatPrice(item.price)}</strong><span className="list-stock"><i /> {item.stock} disponibles</span></div><AddToCartButton id={item.id} name={item.name} price={formatPrice(item.price)} type={item.art} /></article>)}</div></section></main><InnerFooter /></>;
}
