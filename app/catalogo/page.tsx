import InnerFooter from "../components/InnerFooter";
import InnerHeader from "../components/InnerHeader";
import AddToCartButton from "../components/AddToCartButton";

const featured = [
  { tag: "TOP VENTA 01", title: "Neumáticos para camión", text: "Opciones para trabajo pesado y recorridos exigentes.", type: "tyre", stock: "8 disponibles", price: "$189.990" },
  { tag: "TOP VENTA 02", title: "Aceite de motor", text: "Lubricación para mantener tu vehículo en movimiento.", type: "oil", stock: "24 disponibles", price: "$32.990" },
  { tag: "TOP VENTA 03", title: "Baterías", text: "Energía confiable para autos, camiones y maquinaria.", type: "battery", stock: "6 disponibles", price: "$89.990" },
];
const more = [
  { title: "Filtros de aceite y aire", category: "MANTENCIÓN", text: "Insumos para el mantenimiento periódico de tu vehículo.", stock: "18 disponibles", price: "$12.990" },
  { title: "Pastillas de freno", category: "SEGURIDAD", text: "Componentes para una conducción más segura.", stock: "12 disponibles", price: "$46.990" },
  { title: "Refrigerante", category: "MANTENCIÓN", text: "Protección para el sistema de enfriamiento.", stock: "15 disponibles", price: "$9.990" },
  { title: "Kit de emergencia", category: "SEGURIDAD", text: "Elementos esenciales para llevar siempre contigo.", stock: "9 disponibles", price: "$24.990" },
  { title: "Accesorios para carga", category: "TRANSPORTE", text: "Implementos para organizar y asegurar tu carga.", stock: "7 disponibles", price: "$39.990" },
  { title: "Luces de trabajo LED", category: "EQUIPAMIENTO", text: "Iluminación auxiliar para trabajo y carretera.", stock: "11 disponibles", price: "$54.990" },
  { title: "Plumillas limpiaparabrisas", category: "MANTENCIÓN", text: "Repuestos para una mejor visibilidad en ruta.", stock: "20 disponibles", price: "$8.990" },
  { title: "Cables de batería", category: "EMERGENCIA", text: "Apoyo de arranque para llevar siempre en tu vehículo.", stock: "5 disponibles", price: "$17.990" },
];

export default function CatalogoPage() {
  return <><InnerHeader /><main className="inner-page catalog-page"><section className="page-intro wrap"><p className="eyebrow">Tienda Cares</p><h1>Todo para<br /><em>seguir en ruta.</em></h1><p>Productos e insumos para el cuidado, seguridad y mantenimiento de autos, camiones y maquinaria.</p></section><section className="featured-section"><div className="wrap"><div className="section-head"><div><p className="eyebrow">Los más solicitados</p><h2>Top ventas</h2></div><span className="catalog-count">03 productos destacados</span></div><div className="featured-grid">{featured.map((item) => <article className="featured-product" key={item.title}><div className={`featured-photo product-art ${item.type}`}><span>{item.tag}</span><i /></div><div className="product-copy"><div className="stock"><i /> {item.stock}</div><h3>{item.title}</h3><p>{item.text}</p><strong className="product-price">{item.price}</strong><AddToCartButton id={item.title} name={item.title} price={item.price} type={item.type} /></div></article>)}</div></div></section><section className="all-services wrap"><div className="section-head"><div><p className="eyebrow">Catálogo completo</p><h2>También tenemos<br /><em>lo que necesitas.</em></h2></div><p className="section-note">Productos para mantener tu vehículo listo para la ruta. <small className="stock-note">Precios y stock referenciales del mockup.</small></p></div><div className="service-list products-list">{more.map((item, index) => <article className="service-list-item product-row" key={item.title}><div className={`mini-product-art product-art ${index % 3 === 0 ? "oil" : index % 3 === 1 ? "tyre" : "battery"}`}><i /></div><span className="list-product-copy"><small>{item.category}</small><strong>{item.title}</strong><em>{item.text}</em></span><div className="product-row-meta"><strong>{item.price}</strong><span className="list-stock"><i /> {item.stock}</span></div><AddToCartButton id={item.title} name={item.title} price={item.price} type={index % 3 === 0 ? "oil" : index % 3 === 1 ? "tyre" : "battery"} /></article>)}</div></section></main><InnerFooter /></>;
}
