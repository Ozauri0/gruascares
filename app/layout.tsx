import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "./components/CartProvider";
import WhatsAppButton from "./components/WhatsAppButton";
import { AuthProvider } from "./lib/auth";
import { SiteContentProvider } from "./components/SiteContentProvider";
import { fetchSiteContent } from "./lib/site-content-server";

export const metadata: Metadata = {
  title: "Grúas Cares | Rescate y transporte 24/7",
  description: "Rescate de vehículos, transporte de carga y maquinaria en La Araucanía.",
  icons: { icon: "/favicon.svg" },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const content = await fetchSiteContent();
  return <html lang="es"><body><SiteContentProvider overrides={content}><AuthProvider><CartProvider>{children}<WhatsAppButton /></CartProvider></AuthProvider></SiteContentProvider></body></html>;
}
