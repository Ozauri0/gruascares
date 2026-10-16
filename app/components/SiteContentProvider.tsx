"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { resolve, type ContentOverrides } from "../lib/site-content";
import { EDIT_IMAGE_TAG, encodeKey, EditBridge, isEditFrame } from "./EditBridge";

const SiteContentContext = createContext<{ overrides: ContentOverrides; editing: boolean }>({ overrides: {}, editing: false });

/** Entrega el contenido editado (leído en el servidor) a los componentes del sitio. */
export function SiteContentProvider({ overrides, children }: { overrides: ContentOverrides; children: React.ReactNode }) {
  // Modo edición: solo dentro del editor visual de /admin/contenido (iframe del mismo origen con ?editar=1).
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ContentOverrides | null>(null);
  useEffect(() => setEditing(isEditFrame()), []);

  const value = useMemo(() => ({ overrides: draft ?? overrides, editing }), [draft, overrides, editing]);
  return (
    <SiteContentContext.Provider value={value}>
      {children}
      {editing && <EditBridge onDraft={setDraft} />}
    </SiteContentContext.Provider>
  );
}

/** `t("hero.title")` devuelve el texto o la imagen vigente del campo. */
export function useSiteContent() {
  const { overrides, editing } = useContext(SiteContentContext);
  return useCallback(
    (key: string) => {
      const value = resolve(overrides, key);
      if (!editing) return value;
      // En el editor visual se marca el valor con su clave para saber qué elemento se toca.
      return key.endsWith(".image") ? `${value}${EDIT_IMAGE_TAG}${key}` : `${encodeKey(key)}${value}`;
    },
    [overrides, editing]
  );
}
