"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const PHONE = "56991627809";
const DEFAULT_MESSAGE = "Hola, necesito coordinar un servicio de grúa o serviteca";

function messageForPath(pathname: string | null): string {
  if (!pathname) return DEFAULT_MESSAGE;
  if (pathname.startsWith("/catalogo")) return "Hola, quiero consultar por un producto del catálogo de Grúas Cares";
  if (pathname.startsWith("/carro")) return "Hola, quiero consultar disponibilidad de los productos de mi solicitud en Grúas Cares";
  if (pathname.startsWith("/agendar")) return "Hola, quiero agendar un servicio de grúa o serviteca con Grúas Cares";
  if (pathname.startsWith("/login")) return "Hola, necesito ayuda con el portal de clientes de Grúas Cares";
  return DEFAULT_MESSAGE;
}

export default function WhatsAppButton({ message }: { message?: string }) {
  const pathname = usePathname();
  const text = useMemo(
    () => encodeURIComponent(message ?? messageForPath(pathname)),
    [message, pathname]
  );
  const href = `https://wa.me/${PHONE}?text=${text}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 100);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <a
      className={"wa-float" + (visible ? " show" : "")}
      tabIndex={visible ? 0 : -1}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Contactar a Grúas Cares por WhatsApp para emergencias y consultas"
      title="WhatsApp Grúas Cares · Emergencias 24/7"
    >
      <img src="/images/whatsapp-icon.png" alt="" width={60} height={60} draggable={false} />
    </a>
  );
}
