"use client";

import { useEffect, useState } from "react";
import { resendVerificationRequest } from "../lib/auth-api";

const COOLDOWN_SECONDS = 60;

/** Botón para pedir otro enlace de confirmación; espera un minuto entre envíos. */
export default function ResendVerification({ email }: { email: string }) {
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function resend() {
    setBusy(true);
    setError("");
    try {
      setMessage(await resendVerificationRequest(email));
      setWait(COOLDOWN_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo reenviar el correo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="resend-box">
      <button type="button" className="button button-secondary" disabled={busy || wait > 0} onClick={() => void resend()}>
        {busy ? "Enviando…" : wait > 0 ? `Reenviar en ${wait} s` : "Reenviar enlace de confirmación"}
      </button>
      {message && <small className="resend-note" role="status">{message}</small>}
      {error && <small className="field-error" role="alert">{error}</small>}
    </div>
  );
}
