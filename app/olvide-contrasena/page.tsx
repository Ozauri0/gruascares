"use client";

import { FormEvent, useState } from "react";
import { ApiError } from "../lib/api";
import { forgotPasswordRequest } from "../lib/auth-api";

/** Pide el correo y manda el enlace para restablecer la contraseña (POST /api/auth/forgot-password). */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Ingresa un correo válido.");
      return;
    }
    setBusy(true);
    try {
      // Siempre el mismo mensaje, exista o no la cuenta: no se revela quién está registrado.
      setSent(await forgotPasswordRequest(email.trim()));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? "Hiciste demasiados intentos. Espera unos minutos y vuelve a intentarlo."
          : err instanceof Error ? err.message : "No se pudo procesar la solicitud."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-panel">
        <div className="auth-copy">
          <p className="eyebrow light">Portal de clientes</p>
          <h1>Recupera<br /><em>tu acceso.</em></h1>
          <p>Te enviamos un enlace al correo de tu cuenta para que elijas una contraseña nueva.</p>
          <span className="auth-mark">GC</span>
        </div>
        <div className="auth-form">
          <a className="back-link" href="/login">← Volver a iniciar sesión</a>
          {sent ? (
            <div className="verify-sent" role="status">
              <p className="eyebrow">Revisa tu correo</p>
              <h2>Solicitud enviada.</h2>
              <p>{sent}</p>
              <p className="verify-hint">El enlace sirve una sola vez y vence en 60 minutos. Si no lo ves, revisa la carpeta de spam.</p>
              <p className="auth-note"><a href="/login">Volver a iniciar sesión</a></p>
            </div>
          ) : (
            <>
              <p className="eyebrow">Contraseña olvidada</p>
              <h2>¿Cuál es tu correo?</h2>
              <form onSubmit={submit} noValidate>
                <label>
                  Correo electrónico
                  <input required type="email" autoComplete="email" placeholder="nombre@empresa.cl" value={email} onChange={(e) => setEmail(e.target.value)} />
                  {error && <small className="field-error" role="alert">{error}</small>}
                </label>
                <button className="button" type="submit" disabled={busy}>{busy ? "Enviando…" : <>Enviar enlace <span>↗</span></>}</button>
              </form>
              <p className="auth-note">¿La recordaste? <a href="/login">Inicia sesión</a></p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
