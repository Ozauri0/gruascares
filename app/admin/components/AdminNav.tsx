import Link from "next/link";
import AreaNav from "../../components/AreaNav";
import Icon from "../../components/Icon";

interface AdminNavProps {
  current: "resumen" | "usuarios" | "calendario" | "catalogo" | "registro";
}

export default function AdminNav({ current }: AdminNavProps) {
  const tabs = [
    { id: "resumen", label: "Resumen general", href: "/admin", icon: "chart" },
    { id: "usuarios", label: "Usuarios y equipo", href: "/admin/usuarios", icon: "users" },
    { id: "calendario", label: "Calendario maestro", href: "/admin/calendario", icon: "calendar" },
    { id: "catalogo", label: "Catálogo y precios", href: "/admin/catalogo", icon: "box" },
    { id: "registro", label: "Registro de actividad", href: "/admin/registro", icon: "clipboard" },
  ] as const;

  return (
    <>
    <AreaNav />
    <nav className="admin-nav-tabs" aria-label="Navegación de administración">
      {tabs.map((tab) => {
        const isActive = current === tab.id;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={`admin-nav-tab ${isActive ? "active" : ""}`}
            aria-current={isActive ? "page" : undefined}
          >
            <span className="admin-tab-icon"><Icon name={tab.icon} bare /></span>
            <span className="admin-tab-text">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
    </>
  );
}
