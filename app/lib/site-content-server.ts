import type { ContentOverrides } from "./site-content";

const BACKEND_URL = (process.env.BACKEND_URL || "http://localhost:4000").replace(/\/$/, "");

/**
 * Contenido editado por el administrador, leído en el servidor en cada página.
 * Si el backend no responde se muestran los textos originales: la web pública nunca queda caída por esto.
 */
export async function fetchSiteContent(): Promise<ContentOverrides> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/content`, { cache: "no-store", signal: AbortSignal.timeout(2000) });
    if (!response.ok) return {};
    const data = (await response.json()) as { content?: unknown };
    if (!data.content || typeof data.content !== "object") return {};
    return Object.fromEntries(Object.entries(data.content as Record<string, unknown>).filter(([, v]) => typeof v === "string")) as ContentOverrides;
  } catch {
    return {};
  }
}
