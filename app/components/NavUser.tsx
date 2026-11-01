"use client";

import Link from "next/link";
import { HOME_FOR_ROLE } from "../lib/route-guard";
import { firstName, useAuth } from "../lib/auth";

/** Acceso al portal: «Portal» sin sesión o el primer nombre con sesión iniciada (lleva a su página de inicio). */
export default function NavUser() {
  const { user } = useAuth();
  if (!user) return <Link className="nav-user" href="/login">Portal</Link>;
  return <Link className="nav-user" href={HOME_FOR_ROLE[user.role]} title="Ir a mi portal">{firstName(user.name)}</Link>;
}
