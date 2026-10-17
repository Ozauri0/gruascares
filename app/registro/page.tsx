"use client";

import { FormEvent, useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import { HOME_FOR_ROLE, useAuth } from "../lib/auth";
import { isSafeInternalPath, rememberRedirect } from "../lib/post-login";
import ResendVerification from "../components/ResendVerification";

export default function RegisterPage() {
  const { user, register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    if (user && !busy) window.location.replace(HOME_FOR_ROLE[user.role]);
  }, [user, busy]);

  // Si llegó desde una pantalla que exigía cuenta (p. ej. /agendar), se vuelve ahí al iniciar sesión tras confirmar el correo.
  useEffect(() => {
    const redirect = new URLSearchParams(window.location.search).get("redirect");
    if (isSafeInternalPath(redirect)) rememberRedirect(redirect);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = "El nombre es obligatorio (mínimo 2 caracteres).";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = "Ingresa un correo válido.";
    if (password.length < 8) next.password = "Mínimo 8 caracteres (igual que en el backend).";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      const result = await register({ name: name.trim(), email: email.trim(), password, phone });
      setSentTo(result.email);
      setBusy(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo crear la cuenta.";
      // 409: el correo ya existe → se muestra junto al campo; el resto, como error general.
      setErrors(err instanceof ApiError && err.status === 409 ? { email: message } : { form: message });
      setBusy(false);
    }
  }

  return <><main className="auth-page"><div className="auth-panel"><div className="auth-copy"><p className="eyebrow light">Portal de clientes</p><h1>Crea tu cuenta<br /><em>en un minuto.</em></h1><p>Registra tus vehículos, agenda servicios y sigue tus atenciones desde un solo lugar.</p><span className="auth-mark">GC</span></div><div className="auth-form"><a className="back-link" href="/">← Volver al inicio</a>{sentTo ? <div className="verify-sent" role="status"><p className="eyebrow">Revisa tu correo</p><h2>Casi listo.</h2><p>Te enviamos un enlace de confirmación a <b>{sentTo}</b>. Ábrelo para activar tu cuenta; vence en 24 horas.</p><p className="verify-hint">Si no lo ves, revisa la carpeta de spam.</p><ResendVerification email={sentTo} /><p className="auth-note">¿Ya confirmaste? <a href="/login">Inicia sesión</a></p></div> : <><p className="eyebrow">Registro</p><h2>Hola, ¿nos presentamos?</h2><form onSubmit={submit} noValidate><label>Nombre completo<input required placeholder="Tu nombre" value={name} onChange={(e) => setName(e.target.value)} />{errors.name && <small className="field-error">{errors.name}</small>}</label><label>Correo electrónico<input required type="email" placeholder="nombre@empresa.cl" value={email} onChange={(e) => setEmail(e.target.value)} />{errors.email && <small className="field-error">{errors.email}</small>}</label><div className="form-row"><label>Teléfono<input type="tel" placeholder="+56 9 ..." value={phone} onChange={(e) => setPhone(e.target.value)} /></label><label>Contraseña<input required type="password" placeholder="Mínimo 8 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} />{errors.password && <small className="field-error">{errors.password}</small>}</label></div>{errors.form && <small className="field-error" role="alert">{errors.form}</small>}<button className="button" type="submit" disabled={busy}>{busy ? "Creando cuenta…" : <>Crear cuenta <span>↗</span></>}</button></form><p className="auth-note">¿Ya tienes cuenta? <a href="/login">Inicia sesión</a></p></>}</div></div></main></>;
}
