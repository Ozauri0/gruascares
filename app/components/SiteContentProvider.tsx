"use client";

import { createContext, useCallback, useContext } from "react";
import { resolve, type ContentOverrides } from "../lib/site-content";

const SiteContentContext = createContext<ContentOverrides>({});

/** Entrega el contenido editado (leído en el servidor) a los componentes del sitio. */
export function SiteContentProvider({ overrides, children }: { overrides: ContentOverrides; children: React.ReactNode }) {
  return <SiteContentContext.Provider value={overrides}>{children}</SiteContentContext.Provider>;
}

/** `t("hero.title")` devuelve el texto o la imagen vigente del campo. */
export function useSiteContent() {
  const overrides = useContext(SiteContentContext);
  return useCallback((key: string) => resolve(overrides, key), [overrides]);
}
