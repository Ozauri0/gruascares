"use client";

import { FormEvent, useState } from "react";
import InnerHeader from "../components/InnerHeader";
import { HOME_FOR_ROLE, useAuth } from "../lib/auth";
import type { UserRole } from "../lib/portal-types";

const DEMO_ACCOUNTS: { role: UserRole; label: string }[] = [
  { role: "usuario", label: "Cliente" },
  { role: "mecanico", label: "Mecánico" },
  { role: "admin", label: "Admin" },
];

// Solo rutas internas: rechaza "//host", "/\\host" y cualquier URL que resuelva a otro origen.
function redirectTarget(): string | null {
  const redirect = new URLSearchParams(window.location.search).get("redirect");
  if (!redirect || !redirect.startsWith("/") || redirect.startsWith("//") || redirect.includes("\\")) return null;
  try {
    const url = new URL(redirect, window.location.origin);
    return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch {
    return null;
  }
}

export default function LoginPage() {
  const { loginAs, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [demoError, setDemoError] = useState("");
  const [busy, setBusy] = useState<UserRole | "form" | null>(null);

  function goHome(role: UserRole) {
    window.location.href = redirectTarget() ?? HOME_FOR_ROLE[role];
  }

  // Acceso demostrativo: sesión real de la cuenta demo, sin pedir credenciales.
  async function enter(role: UserRole) {
    setDemoError("");
    setBusy(role);
    try {
      const user = await loginAs(role);
      goHome(user.role);
    } catch (err) {
      setDemoError(err instanceof Error ? err.message : "No se pudo iniciar la sesión demo.");
      setBusy(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Ingresa un correo válido.");
      return;
    }
    if (!password) {
      setError("Ingresa tu contraseña.");
      return;
    }
    setBusy("form");
    try {
      const user = await login(email.trim(), password);
      goHome(user.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión.");
      setBusy(null);
    }
  }

  return <><InnerHeader /><main className="auth-page"><div className="auth-panel"><div className="auth-copy"><p className="eyebrow light">Portal de clientes</p><h1>Todo tu servicio,<br /><em>en un solo lugar.</em></h1><p>Ingresa para revisar tus solicitudes, datos de contacto y próximos servicios.</p><span className="auth-mark">GC</span></div><div className="auth-form"><a className="back-link" href="/">← Volver al inicio</a><p className="eyebrow">Iniciar sesión</p><h2>Bienvenido de vuelta.</h2><form onSubmit={submit} noValidate><label>Correo electrónico<input required type="email" placeholder="nombre@empresa.cl" value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>Contraseña<input required type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />{error && <small className="field-error">{error}</small>}</label><button className="button" type="submit" disabled={busy !== null}>{busy === "form" ? "Ingresando…" : <>Ingresar <span>↗</span></>}</button></form><div className="demo-accounts"><p>Cuentas demostrativas</p>{DEMO_ACCOUNTS.map((account) => <button key={account.role} type="button" disabled={busy !== null} onClick={() => enter(account.role)}>{busy === account.role ? "Entrando…" : <>Entrar como {account.label}</>}</button>)}{demoError && <small className="field-error" role="alert">{demoError}</small>}</div><p className="auth-note">¿Aún no tienes cuenta? <a href="/registro">Crea tu cuenta</a></p></div></div></main></>;
}
