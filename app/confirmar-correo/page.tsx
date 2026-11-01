"use client";

import { useEffect, useRef, useState } from "react";
import ResendVerification from "../components/ResendVerification";
import { verifyEmailRequest } from "../lib/auth-api";

type State = { status: "loading" } | { status: "ok"; message: string } | { status: "error"; message: string };

/** Destino del enlace del correo de confirmación: /confirmar-correo?token=… */
export default function ConfirmEmailPage() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [email, setEmail] = useState("");
  const started = useRef(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setState({ status: "error", message: "El enlace está incompleto. Abre el enlace completo del correo o pide uno nuevo." });
      return;
    }
    // El enlace es de un solo uso: en desarrollo React ejecuta este efecto dos veces y la segunda petición
    // fallaría con "ya usado" y taparía el éxito de la primera. Se envía una sola vez.
    if (started.current) return;
    started.current = true;
    verifyEmailRequest(token)
      .then((message) => setState({ status: "ok", message }))
      .catch((err) => setState({ status: "error", message: err instanceof Error ? err.message : "No se pudo confirmar el correo." }));
  }, []);

  return (
    <main className="auth-page">
      <div className="auth-panel">
        <div className="auth-copy">
          <p className="eyebrow light">Portal de clientes</p>
          <h1>Confirma<br /><em>tu correo.</em></h1>
          <p>Así sabemos que tu cuenta es tuya y mantenemos el portal libre de cuentas falsas.</p>
          <span className="auth-mark">GC</span>
        </div>
        <div className="auth-form">
          <a className="back-link" href="/">← Volver al inicio</a>
          {state.status === "loading" && <div role="status" aria-busy="true"><p className="eyebrow">Un momento</p><h2>Confirmando tu correo…</h2></div>}
          {state.status === "ok" && (
            <div role="status">
              <p className="eyebrow">Listo</p>
              <h2>¡Correo confirmado!</h2>
              <p>Tu cuenta está activa: ya puedes iniciar sesión.</p>
              <a className="button" href="/login">Iniciar sesión <span>↗</span></a>
            </div>
          )}
          {state.status === "error" && (
            <div role="alert">
              <p className="eyebrow">No se pudo confirmar</p>
              <h2>Este enlace no sirve.</h2>
              <p>{state.message}</p>
              <label>
                Tu correo
                <input type="email" placeholder="nombre@correo.cl" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </label>
              {/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && <ResendVerification email={email.trim()} />}
              <p className="auth-note">¿Ya confirmaste? <a href="/login">Inicia sesión</a></p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
