"use client";

import { usePathname } from "next/navigation";
import InnerHeader from "./InnerHeader";

/** Barra superior de las rutas internas. Vive en el layout raíz para no volver a montarse al cambiar de página (la portada trae la suya). */
export default function SiteHeader() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return <InnerHeader />;
}
