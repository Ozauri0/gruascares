"use client";

import { FormEvent, useEffect, useState } from "react";
import CartLink from "./components/CartLink";
import NavUser from "./components/NavUser";
import SocialLinks from "./components/SocialLinks";
import { useSiteContent } from "./components/SiteContentProvider";
import { RichText } from "./components/RichText";
import { DEFAULTS, telHref } from "./lib/site-content";
import Icon from "./components/Icon";

const SLIDE_NUMBERS = [1, 2, 3, 4];
const SERVICE_NUMBERS = [1, 2, 3];

export default function Home() {
  const t = useSiteContent();
  const logo = t("site.logo.image");
  const slides = SLIDE_NUMBERS.map((n) => ({ image: t(`hero.slide${n}.image`), label: t(`hero.slide${n}.label`), detail: t(`hero.slide${n}.detail`) }));
  const services = SERVICE_NUMBERS.map((n) => ({
    number: String(n).padStart(2, "0"),
    title: t(`service${n}.title`),
    text: t(`service${n}.text`),
    image: t(`service${n}.image`),
    // La preselección en /agendar usa el nombre original del servicio, aunque se edite el título mostrado.
    requestName: DEFAULTS[`service${n}.title`],
  }));
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
      <div className="topbar"><span><i className="live-dot" /> {t("topbar.text")}</span><span className="top-location">{t("topbar.location")}</span><a href="tel:+56991627809">+56 9 9162 7809 <b>↗</b></a></div>
      <nav className="nav wrap">
        <a className="brand" href="#inicio"><img src={logo} alt="Grúas Cares" /></a>
        <div className={"nav-links " + (menuOpen ? "open" : "")}>
          <a href="#nosotros" onClick={() => setMenuOpen(false)}>Nosotros</a>
          <a href="#servicios" onClick={() => setMenuOpen(false)}>Servicios</a>
          <a href="/catalogo" onClick={() => setMenuOpen(false)}>Catálogo</a>
          <a href="#contacto" onClick={() => setMenuOpen(false)}>Contacto</a>
        </div>
        <CartLink />
        <NavUser />
        <a className="nav-cta" href="/agendar">Agendar servicio <span>↗</span></a>
        <button className="menu-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="Abrir menú"><Icon name="menu" bare /></button>
      </nav>

      <section className="hero" id="inicio">
        <div className="hero-content wrap">
          <p className="eyebrow light">{t("hero.eyebrow")}</p>
          <h1><RichText value={t("hero.title")} /></h1>
          <p className="hero-copy">{t("hero.copy")}</p>
          <div className="hero-actions"><a className="button yellow" href="/agendar">{t("hero.cta")} <span>↗</span></a><a className="text-link" href="/catalogo">{t("hero.link")} <span>↓</span></a></div>
        </div>
        <div className="hero-gallery">
          {slides.map((slide, index) => <div className={"hero-slide " + (activeSlide === index ? "active" : "")} key={slide.image} style={{ backgroundImage: `url(${slide.image})` }} aria-hidden={activeSlide !== index} />)}
          <div className="hero-gallery-info"><strong>{slides[activeSlide].label}</strong><small>{slides[activeSlide].detail}</small></div>
          <div className="hero-controls"><button type="button" aria-label="Imagen anterior" onClick={() => setActiveSlide((activeSlide - 1 + slides.length) % slides.length)}>←</button><div className="hero-dots">{slides.map((slide, index) => <button type="button" className={activeSlide === index ? "current" : ""} aria-label={`Ver imagen ${index + 1}`} onClick={() => setActiveSlide(index)} key={slide.image} />)}</div><button type="button" aria-label="Imagen siguiente" onClick={() => setActiveSlide((activeSlide + 1) % slides.length)}>→</button></div>
        </div>
        <div className="hero-meta"><span>{t("hero.meta1")}</span><span>{t("hero.meta2")}</span><span className="scroll">Desliza para explorar ↓</span></div>
      </section>
      {showHomeButton && <a className="hero-home" href="#inicio" aria-label="Volver al inicio">↑</a>}

      <section className="intro wrap" id="nosotros">
        <div><p className="eyebrow">{t("about.eyebrow")}</p><h2><RichText value={t("about.title")} /></h2></div>
        <div className="intro-text"><p>{t("about.text")}</p><a className="arrow-link" href="/catalogo">{t("about.link")} <span>↗</span></a></div>
      </section>

      <section className="services-section" id="servicios"><div className="wrap"><div className="section-head"><div><p className="eyebrow">{t("services.eyebrow")}</p><h2><RichText value={t("services.title")} /></h2></div><p className="section-note">{t("services.note")}</p></div>
        <div className="service-grid">{services.map((item) => <article className="service-card" key={item.number}><div className="service-image" style={{ backgroundImage: `url(${item.image})` }}><span>{item.number}</span></div><div className="service-info"><h3>{item.title}</h3><p>{item.text}</p><a href={`/agendar?servicio=${encodeURIComponent(item.requestName)}`} onClick={() => setService(item.requestName)}>{t("services.cta")} <span>↗</span></a></div></article>)}</div>
      </div></section>

      <section className="catalog wrap" id="catalogo"><div className="catalog-image" style={{ backgroundImage: `url(${t("catalog.image")})` }}><div className="catalog-label">Flota<br /><strong>Cares</strong></div></div><div className="catalog-copy"><p className="eyebrow">{t("catalog.eyebrow")}</p><h2><RichText value={t("catalog.title")} /></h2><p>{t("catalog.text")}</p><a className="button dark" href="/catalogo">{t("catalog.button")} <span>↗</span></a><div className="stats">{[1, 2, 3].map((n) => <div key={n}><strong>{t(`catalog.stat${n}.value`)}</strong><span>{t(`catalog.stat${n}.label`)}</span></div>)}</div></div></section>

      <section className="booking" id="agenda"><div className="wrap booking-layout"><div><p className="eyebrow light">{t("booking.eyebrow")}</p><h2><RichText value={t("booking.title")} /></h2><p className="booking-copy">{t("booking.copy")}</p><div className="contact-line"><span>{t("booking.urgent")}</span><a href="tel:+56991627809">{t("booking.urgent_link")} ↗</a></div></div><form onSubmit={submit}>{sent ? <div className="success"><span><Icon name="check" bare /></span><h3>Solicitud recibida</h3><p>Te contactaremos a la brevedad para coordinar tu servicio.</p><button type="button" className="button yellow" onClick={() => setSent(false)}>Enviar otra solicitud</button></div> : <><div className="form-row"><label>Nombre completo<input required placeholder="Tu nombre" /></label><label>Teléfono<input required type="tel" placeholder="+56 9 ..." /></label></div><label>¿Qué necesitas?<select value={service} onChange={(e) => setService(e.target.value)}><option>Grúa de plataforma hidráulica</option><option>Transporte de cargas pesadas</option><option>Camiones grúa</option></select></label><label>Cuéntanos brevemente<textarea placeholder="Lugar, fecha y detalles del servicio" rows={3} /></label><button className="button yellow" type="submit">Solicitar contacto <span>↗</span></button></>}</form></div></section>

      <section className="map-section" id="ubicacion" aria-label="Ubicación de Grúas Cares">
        <div className="wrap map-head">
          <div><p className="eyebrow">{t("map.eyebrow")}</p><h2><RichText value={t("map.title")} /></h2></div>
          <p className="section-note">{t("map.note")}</p>
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

      <footer id="contacto"><div className="wrap footer-main"><a className="brand footer-brand" href="#inicio"><img src={logo} alt="Grúas Cares" /></a><div><p className="footer-title">{t("footer.contact.title")}</p><a href={telHref(t("footer.phone1"))}>{t("footer.phone1")}</a><a href={telHref(t("footer.phone2"))}>{t("footer.phone2")}</a><a href={telHref(t("footer.phone3"))}>{t("footer.phone3")}</a></div><div><p className="footer-title">{t("footer.social.title")}</p><SocialLinks /></div></div><div className="wrap footer-bottom"><span>{t("footer.bottom1")}</span><span>{t("footer.bottom2")}</span></div></footer>
    </main>
  );
}
