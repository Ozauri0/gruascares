"use client";

import { FormEvent, useState } from "react";
import InnerHeader from "../components/InnerHeader";
import { HOME_FOR_ROLE, useAuth } from "../lib/auth";
import type { UserRole } from "../lib/portal-types";

const DEMO_ACCOUNTS: { role: UserRole; label: string; email: string }[] = [
  { role: "usuario", label: "Cliente", email: "cliente@demo.cl" },
  { role: "mecanico", label: "Mecánico", email: "mecanico@gruascares.cl" },
  { role: "admin", label: "Admin", email: "admin@gruascares.cl" },
];

function redirectTarget(): string | null {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get("redirect");
  return redirect && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : null;
}

export default function LoginPage() {
  const { loginAs } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function enter(role: UserRole) {
    loginAs(role);
    window.location.href = redirectTarget() ?? HOME_FOR_ROLE[role];
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    const normalized = email.trim().toLowerCase();
    // El dominio corporativo identifica al equipo: admin@ es administrador
    // y el resto de @gruascares.cl es personal de taller (mecánico).
    // Al conectar la API real, el rol lo devuelve POST /api/auth/login.
    if (normalized === "admin@gruascares.cl" || normalized.startsWith("admin@")) {
      enter("admin");
    } else if (normalized.endsWith("@gruascares.cl")) {
      enter("mecanico");
    } else {
      enter("usuario");
    }
  }

  return <><InnerHeader /><main className="auth-page"><div className="auth-panel"><div className="auth-copy"><p className="eyebrow light">Portal de clientes</p><h1>Todo tu servicio,<br /><em>en un solo lugar.</em></h1><p>Ingresa para revisar tus solicitudes, datos de contacto y próximos servicios.</p><span className="auth-mark">GC</span></div><div className="auth-form"><a className="back-link" href="/">← Volver al inicio</a><p className="eyebrow">Iniciar sesión</p><h2>Bienvenido de vuelta.</h2><form onSubmit={submit} noValidate><label>Correo electrónico<input required type="email" placeholder="nombre@empresa.cl" value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>Contraseña<input required type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />{error && <small className="field-error">{error}</small>}</label><button className="button" type="submit">Ingresar <span>↗</span></button></form><div className="demo-accounts"><p>Cuentas demostrativas</p>{DEMO_ACCOUNTS.map((account) => <button key={account.role} type="button" onClick={() => enter(account.role)}>Entrar como {account.label}</button>)}</div><p className="auth-note">¿Aún no tienes cuenta? <a href="/registro">Crea tu cuenta</a></p></div></div></main></>;
}
