"use client";

import { telHref } from "../lib/site-content";
import { useSiteContent } from "./SiteContentProvider";

export default function InnerFooter() {
  const t = useSiteContent();
  return <footer className="inner-footer"><div className="wrap inner-footer-grid"><a className="brand" href="/"><img src={t("site.logo.image")} alt="Grúas Cares" /></a><div><p className="footer-title">{t("footer.contact.title")}</p><a href={telHref(t("footer.phone1"))}>{t("footer.phone1")}</a><a href={telHref(t("footer.phone2"))}>{t("footer.phone2")}</a></div><div><p className="footer-title">{t("footer.location.title")}</p><span>{t("footer.inner1")}</span><span>{t("footer.inner2")}</span></div></div></footer>;
}
