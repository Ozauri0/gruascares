import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Grúas Cares | Rescate y transporte 24/7",
  description: "Rescate de vehículos, transporte de carga y maquinaria en La Araucanía.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
