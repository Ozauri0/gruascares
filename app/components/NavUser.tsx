"use client";

import { HOME_FOR_ROLE, firstName, useAuth } from "../lib/auth";

/** Acceso al portal: «Portal» sin sesión o el primer nombre del usuario con sesión iniciada. */
export default function NavUser() {
  const { user } = useAuth();
  return <a className="nav-user" href={user ? HOME_FOR_ROLE[user.role] : "/login"} title={user ? "Ir a mi portal" : undefined}>{user ? firstName(user.name) : "Portal"}</a>;
}
