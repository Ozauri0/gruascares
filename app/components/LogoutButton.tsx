"use client";

import { useAuth } from "../lib/auth";

export default function LogoutButton() {
  const { logout } = useAuth();
  return (
    <button
      type="button"
      className="logout-btn"
      onClick={() => {
        logout();
        window.location.href = "/";
      }}
    >
      Cerrar sesión
    </button>
  );
}
