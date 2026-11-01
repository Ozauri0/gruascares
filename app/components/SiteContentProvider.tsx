"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { resolve, type ContentOverrides } from "../lib/site-content";

type Ctx = { overrides: ContentOverrides; setPreview: (values: ContentOverrides | null) => void };
const SiteContentContext = createContext<Ctx>({ overrides: {}, setPreview: () => {} });

/** Entrega el contenido publicado (leído en el servidor) a los componentes del sitio. */
export function SiteContentProvider({ overrides, children }: { overrides: ContentOverrides; children: React.ReactNode }) {
  // Vista previa del editor: mientras el admin edita, se muestra su borrador en lugar de lo publicado (solo en su navegador).
  const [preview, setPreview] = useState<ContentOverrides | null>(null);
  const value = useMemo(() => ({ overrides: preview ?? overrides, setPreview }), [preview, overrides]);
  return <SiteContentContext.Provider value={value}>{children}</SiteContentContext.Provider>;
}

/** `t("hero.title")` devuelve el texto o la imagen vigente del campo. */
export function useSiteContent() {
  const { overrides } = useContext(SiteContentContext);
  return useCallback((key: string) => resolve(overrides, key), [overrides]);
}

/** Para el editor: fija (o quita con null) el borrador que se muestra en vez de lo publicado. */
export function useContentPreview() {
  return useContext(SiteContentContext).setPreview;
}
