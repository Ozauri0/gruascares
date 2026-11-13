"use client";

import { telHref } from "../lib/site-content";
import { useSiteContent } from "./SiteContentProvider";

export default function InnerFooter() {
  const t = useSiteContent();
  return <footer className="inner-footer"><div className="wrap inner-footer-grid"><div className="brand-group"><a className="brand" href="/"><img src={t("site.logo.image")} alt="Grúas Cares" /></a><a className="brand brand-serviteca" href="/#serviteca" aria-label="Serviteca Cares"><img src={t("site.logo2.image")} alt="Serviteca Cares" /></a></div><div><p className="footer-title">{t("footer.contact.title")}</p><div className="footer-contacts"><div><a href={telHref(t("footer.phone1"))}>{t("footer.phone1")}</a><a href={telHref(t("footer.phone2"))}>{t("footer.phone2")}</a></div><div><a href={`mailto:${t("footer.email1").trim()}`}>{t("footer.email1")}</a><a href={`mailto:${t("footer.email2").trim()}`}>{t("footer.email2")}</a></div></div></div><div><p className="footer-title">{t("footer.location.title")}</p><span>{t("footer.inner1")}</span><span>{t("footer.inner2")}</span><a href="/terminos" className="footer-legal-link">Términos y privacidad</a></div></div></footer>;
}
