"use client";

import { FormEvent, useEffect, useState } from "react";
import SocialLinks from "./components/SocialLinks";

const imageBase = "/images/";
const logo = "/images/logo.png";
const slides = [
  { image: imageBase + "carousel-01.webp", label: "Rescate vehicular", detail: "Atención las 24 horas" },
  { image: imageBase + "carousel-02.webp", label: "Transporte de cargas", detail: "Seguridad y eficiencia" },
  { image: imageBase + "carousel-03.webp", label: "Camiones grúa", detail: "Villarrica · IX Región" },
  { image: imageBase + "carousel-04.webp", label: "Grúas Cares", detail: "Servicio confiable" },
];
const services = [
  { number: "01", title: "Grúa de plataforma hidráulica", text: "Servicio de grúa para el traslado seguro de vehículos, con atención las 24 horas.", image: imageBase + "service-plataforma.jpg" },
  { number: "02", title: "Transporte de cargas pesadas", text: "Soluciones de transporte seguras, eficientes y adaptadas a cada necesidad.", image: imageBase + "service-carga.jpg" },
  { number: "03", title: "Camiones grúa", text: "Servicios de camiones grúa con un equipo comprometido con la puntualidad y la calidad.", image: imageBase + "service-alcance.jpg" },
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [service, setService] = useState("Rescate vehicular");
  const [activeSlide, setActiveSlide] = useState(0);
  const [showHomeButton, setShowHomeButton] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setActiveSlide((current) => (current + 1) % slides.length), 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onScroll = () => setShowHomeButton(window.scrollY > window.innerHeight * 0.65);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSent(true);
  }

  return (
    <main>
      <div className="topbar"><span><i className="live-dot" /> Atención de emergencias 24/7</span><span className="top-location">Villarrica · IX Región</span><a href="tel:+56991627809">+56 9 9162 7809 <b>↗</b></a></div>
      <nav className="nav wrap">
        <a className="brand" href="#inicio"><img src={logo} alt="Grúas Cares" /></a>
        <div className={"nav-links " + (menuOpen ? "open" : "")}>
          <a href="#nosotros" onClick={() => setMenuOpen(false)}>Nosotros</a>
          <a href="#servicios" onClick={() => setMenuOpen(false)}>Servicios</a>
          <a href="/catalogo" onClick={() => setMenuOpen(false)}>Catálogo</a>
          <a href="/login" onClick={() => setMenuOpen(false)}>Portal</a>
          <a href="#contacto" onClick={() => setMenuOpen(false)}>Contacto</a>
        </div>
        <a className="nav-cta" href="/agendar">Agendar servicio <span>↗</span></a>
        <button className="menu-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="Abrir menú">☰</button>
      </nav>

      <section className="hero" id="inicio">
        <div className="hero-content wrap">
          <p className="eyebrow light">Grúas Cares · Villarrica</p>
          <h1>Rescate y<br /><em>transporte</em><br />cuando lo necesitas.</h1>
          <p className="hero-copy">Servicio de grúas rápido y confiable en Villarrica y toda la IX Región. Atendemos emergencias las 24 horas.</p>
          <div className="hero-actions"><a className="button yellow" href="/agendar">Llámanos ahora <span>↗</span></a><a className="text-link" href="/catalogo">Ver servicios <span>↓</span></a></div>
        </div>
        <div className="hero-gallery">
          {slides.map((slide, index) => <div className={"hero-slide " + (activeSlide === index ? "active" : "")} key={slide.image} style={{ backgroundImage: `url(${slide.image})` }} aria-hidden={activeSlide !== index} />)}
          <div className="hero-gallery-info"><strong>{slides[activeSlide].label}</strong><small>{slides[activeSlide].detail}</small></div>
          <div className="hero-controls"><button type="button" aria-label="Imagen anterior" onClick={() => setActiveSlide((activeSlide - 1 + slides.length) % slides.length)}>←</button><div className="hero-dots">{slides.map((slide, index) => <button type="button" className={activeSlide === index ? "current" : ""} aria-label={`Ver imagen ${index + 1}`} onClick={() => setActiveSlide(index)} key={slide.image} />)}</div><button type="button" aria-label="Imagen siguiente" onClick={() => setActiveSlide((activeSlide + 1) % slides.length)}>→</button></div>
        </div>
        <div className="hero-meta"><span>Villarrica</span><span>IX Región de la Araucanía</span><span className="scroll">Desliza para explorar ↓</span></div>
      </section>
      {showHomeButton && <a className="hero-home" href="#inicio" aria-label="Volver al inicio">↑</a>}

      <section className="intro wrap" id="nosotros">
        <div><p className="eyebrow">Transporte seguro</p><h2>Tu carga es<br />nuestra <em>responsabilidad.</em></h2></div>
        <div className="intro-text"><p>Somos Grúas Cares, especialistas en transporte de cargas pesadas y servicios de camiones grúa. Contamos con una flota moderna y un equipo de profesionales comprometidos con la puntualidad, la seguridad y la calidad.</p><a className="arrow-link" href="/catalogo">Explora el catálogo <span>↗</span></a></div>
      </section>

      <section className="services-section" id="servicios"><div className="wrap"><div className="section-head"><div><p className="eyebrow">Lo que hacemos</p><h2>Soluciones para<br /><em>seguir avanzando.</em></h2></div><p className="section-note">Una flota preparada y un equipo que entiende que tu tiempo también se transporta.</p></div>
        <div className="service-grid">{services.map((item) => <article className="service-card" key={item.number}><div className="service-image" style={{ backgroundImage: `url(${item.image})` }}><span>{item.number}</span></div><div className="service-info"><h3>{item.title}</h3><p>{item.text}</p><a href={`/agendar?servicio=${encodeURIComponent(item.title)}`} onClick={() => setService(item.title)}>Solicitar servicio <span>↗</span></a></div></article>)}</div>
      </div></section>

      <section className="catalog wrap" id="catalogo"><div className="catalog-image"><div className="catalog-label">Flota<br /><strong>Cares</strong></div></div><div className="catalog-copy"><p className="eyebrow">Catálogo de soluciones</p><h2>Una flota<br />para cada<br /><em>necesidad.</em></h2><p>Conoce los servicios de Grúas Cares y encuentra una solución segura, eficiente y adaptada a tu traslado.</p><a className="button dark" href="/catalogo">Ver catálogo completo <span>↗</span></a><div className="stats"><div><strong>24/7</strong><span>Atención</span></div><div><strong>IX</strong><span>Región</span></div><div><strong>3</strong><span>Teléfonos</span></div></div></div></section>

      <section className="booking" id="agenda"><div className="wrap booking-layout"><div><p className="eyebrow light">Agenda tu servicio</p><h2>Cuéntanos qué<br /><em>necesitas mover.</em></h2><p className="booking-copy">Déjanos tus datos y te contactaremos para coordinar la mejor solución.</p><div className="contact-line"><span>¿Es urgente?</span><a href="tel:+56991627809">Llámanos ahora ↗</a></div></div><form onSubmit={submit}>{sent ? <div className="success"><span>✓</span><h3>Solicitud recibida</h3><p>Te contactaremos a la brevedad para coordinar tu servicio.</p><button type="button" className="button yellow" onClick={() => setSent(false)}>Enviar otra solicitud</button></div> : <><div className="form-row"><label>Nombre completo<input required placeholder="Tu nombre" /></label><label>Teléfono<input required type="tel" placeholder="+56 9 ..." /></label></div><label>¿Qué necesitas?<select value={service} onChange={(e) => setService(e.target.value)}><option>Grúa de plataforma hidráulica</option><option>Transporte de cargas pesadas</option><option>Camiones grúa</option></select></label><label>Cuéntanos brevemente<textarea placeholder="Lugar, fecha y detalles del servicio" rows={3} /></label><button className="button yellow" type="submit">Solicitar contacto <span>↗</span></button></>}</form></div></section>

      <section className="map-section" id="ubicacion" aria-label="Ubicación de Grúas Cares">
        <div className="wrap map-head">
          <div><p className="eyebrow">Dónde estamos</p><h2>Encuéntranos en <em>Villarrica.</em></h2></div>
          <p className="section-note">Atención de emergencias 24/7 en Villarrica y la IX Región de la Araucanía.</p>
        </div>
        <div className="wrap map-frame">
          <iframe
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3086.9554504773114!2d-72.23451242329556!3d-39.311933321139655!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x96146f3b6b2b7983%3A0x9128f8389533021!2sGr%C3%BAas%20Cares%20Villarrica!5e0!3m2!1ses-419!2scl!4v1747685714817!5m2!1ses-419!2scl"
            title="Ubicación Grúas Cares en Villarrica"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
      </section>

      <footer id="contacto"><div className="wrap footer-main"><a className="brand footer-brand" href="#inicio"><img src={logo} alt="Grúas Cares" /></a><div><p className="footer-title">Contacto emergencia</p><a href="tel:+56991627809">+56 9 9162 7809</a><a href="tel:+56968327329">+56 9 6832 7329</a><a href="tel:+56968574677">+56 9 6857 4677</a></div><div><p className="footer-title">Síguenos</p><SocialLinks /></div></div><div className="wrap footer-bottom"><span>Grúas Cares Villarrica</span><span>IX Región de la Araucanía y alrededores</span></div></footer>
    </main>
  );
}
