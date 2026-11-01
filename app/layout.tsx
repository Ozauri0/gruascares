import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "./components/CartProvider";
import WhatsAppButton from "./components/WhatsAppButton";
import { AuthProvider } from "./lib/auth";
import SiteHeader from "./components/SiteHeader";
import ContentEditor from "./components/ContentEditor";
import { SiteContentProvider } from "./components/SiteContentProvider";
import { fetchSiteContent } from "./lib/site-content-server";
import { THEME_INIT_SCRIPT } from "./lib/theme";

export const metadata: Metadata = {
  title: "Grúas Cares | Rescate y transporte 24/7",
  description: "Rescate de vehículos, transporte de carga y maquinaria en La Araucanía.",
  icons: { icon: "/favicon.png" },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const content = await fetchSiteContent();
  return <html lang="es" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} /></head><body><SiteContentProvider overrides={content}><AuthProvider><CartProvider><SiteHeader />{children}<WhatsAppButton /><ContentEditor /></CartProvider></AuthProvider></SiteContentProvider></body></html>;
}
