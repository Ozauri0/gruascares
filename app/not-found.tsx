import Link from "next/link";
import InnerFooter from "./components/InnerFooter";
import Icon from "./components/Icon";

export const metadata = {
  title: "Página no encontrada (404) | Grúas Cares",
};

export default function NotFound() {
  return (
    <>
      <main className="inner-page not-found-page">
        <section className="wrap not-found-layout">
          <div className="not-found-copy">
            <p className="eyebrow">Error 404 · Ruta no encontrada</p>
            <h1>
              Esta dirección quedó<br />
              <em>fuera de ruta.</em>
            </h1>
            <p className="not-found-lead">
              La página que buscas no existe o cambió de ubicación. Vuelve al inicio para explorar nuestros servicios de grúas, serviteca y catálogo en Villarrica y la IX Región.
            </p>
            <div className="not-found-actions">
              <Link className="button" href="/">
                Volver al inicio <span>↗</span>
              </Link>
              <Link className="button button-secondary" href="/agendar">
                Agendar servicio
              </Link>
              <Link className="button button-secondary" href="/catalogo">
                Ver catálogo
              </Link>
            </div>
          </div>

          <aside className="not-found-card" aria-label="Asistencia de emergencia 24/7">
            <span className="not-found-code" aria-hidden="true">404</span>
            <p className="aside-kicker">Emergencias 24/7 · Villarrica y IX Región</p>
            <h2>¿Necesitas asistencia en ruta ahora mismo?</h2>
            <p>
              Si tienes una urgencia con tu vehículo o carga pesada, llámanos directamente a nuestra central de despacho:
            </p>
            <a href="tel:+56991627809" className="emergency-phone-btn">
              <Icon name="phone" />+56 9 9162 7809 <span>↗</span>
            </a>
          </aside>
        </section>
      </main>
      <InnerFooter />
    </>
  );
}
