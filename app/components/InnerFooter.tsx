"use client";

import { useSiteContent } from "./SiteContentProvider";

export default function InnerFooter() {
  const t = useSiteContent();
  return <footer className="inner-footer"><div className="wrap inner-footer-grid"><a className="brand" href="/"><img src={t("site.logo.image")} alt="Grúas Cares" /></a><div><p className="footer-title">Contacto emergencia</p><a href="tel:+56991627809">+56 9 9162 7809</a><a href="tel:+56968327329">+56 9 6832 7329</a></div><div><p className="footer-title">Ubicación</p><span>{t("footer.inner1")}</span><span>{t("footer.inner2")}</span></div></div></footer>;
}
