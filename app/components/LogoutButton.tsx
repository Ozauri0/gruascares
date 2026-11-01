"use client";

import { useAuth } from "../lib/auth";

export default function LogoutButton() {
  const { logout } = useAuth();
  return (
    <button
      type="button"
      className="logout-btn"
      onClick={async () => {
        await logout().catch(() => null); // aunque falle la red, se limpia la sesión local
        window.location.href = "/";
      }}
    >
      Cerrar sesión
    </button>
  );
}
