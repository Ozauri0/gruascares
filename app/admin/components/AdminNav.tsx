import Link from "next/link";

interface AdminNavProps {
  current: "resumen" | "usuarios" | "calendario" | "catalogo";
}

export default function AdminNav({ current }: AdminNavProps) {
  const tabs = [
    { id: "resumen", label: "Resumen general", href: "/admin", icon: "📊" },
    { id: "usuarios", label: "Usuarios y equipo", href: "/admin/usuarios", icon: "👥" },
    { id: "calendario", label: "Calendario maestro", href: "/admin/calendario", icon: "📅" },
    { id: "catalogo", label: "Catálogo y precios", href: "/admin/catalogo", icon: "📦" },
  ] as const;

  return (
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
            <span className="admin-tab-icon">{tab.icon}</span>
            <span className="admin-tab-text">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
