"use client";

import InnerHeader from "../components/InnerHeader";
import { useCart } from "../components/CartProvider";

export default function CarroPage() {
  const { items, remove, clear } = useCart();
  const message = encodeURIComponent(`Hola, quiero consultar disponibilidad de estos productos:\n${items.map((item) => `- ${item.name} x${item.quantity} (${item.price})`).join("\n")}`);
  return <><InnerHeader /><main className="inner-page cart-page"><section className="cart-section"><div className="wrap cart-layout"><div className="cart-items"><div className="cart-heading"><h2>{items.length ? "Productos seleccionados" : "Tu carro está vacío"}</h2>{items.length > 0 && <button onClick={clear}>Vaciar carro</button>}</div>{items.length ? items.map((item) => <article className="cart-item" key={item.id}><div className={`mini-product-art product-art ${item.type || "oil"}`}><i /></div><div><h3>{item.name}</h3><p>{item.price} · Cantidad: {item.quantity}</p></div><button onClick={() => remove(item.id)} aria-label={`Quitar ${item.name}`}>×</button></article>) : <div className="empty-cart"><span>+</span><p>Agrega productos desde el catálogo para armar tu solicitud.</p><a className="button" href="/catalogo">Explorar catálogo <span>↗</span></a></div>}</div><aside className="cart-aside"><p className="aside-kicker">Compra directa</p><h2>Lo coordinamos<br /><em>contigo.</em></h2><p>Revisaremos tu listado, confirmaremos stock y te indicaremos cómo continuar por teléfono o presencialmente.</p><div className="cart-note"><span>01</span><p>Agrega productos al carro.</p><span>02</span><p>Solicita disponibilidad.</p><span>03</span><p>Coordina directamente con Cares.</p></div>{items.length > 0 && <><a className="button" href={`https://wa.me/56991627809?text=${message}`}>Solicitar por WhatsApp <span>↗</span></a><a className="cart-phone" href="tel:+56991627809">O llámanos al +56 9 9162 7809</a></>}</aside></div></section></main></>;
}
