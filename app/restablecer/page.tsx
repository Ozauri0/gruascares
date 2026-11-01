"use client";

import { FormEvent, useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import { passwordProblem, resetPasswordRequest } from "../lib/auth-api";

/** Destino del enlace del correo de recuperación: /restablecer?token=… */
export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null | undefined>(undefined); // undefined: aún no se lee la URL
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [linkError, setLinkError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- el token solo se conoce en el navegador, tras hidratar
    setToken(new URLSearchParams(window.location.search).get("token"));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (confirm !== password) return setError("Las contraseñas no coinciden.");
    setBusy(true);
    try {
      setDone(await resetPasswordRequest(token as string, password));
    } catch (err) {
      // 400: enlace inválido, vencido o ya usado. Otros errores (red, 429…) se pueden reintentar con el mismo enlace.
      if (err instanceof ApiError && err.status === 400 && /enlace/i.test(err.message)) setLinkError(err.message);
      else setError(err instanceof ApiError && err.status === 429 ? "Demasiados intentos. Espera unos minutos." : err instanceof Error ? err.message : "No se pudo cambiar la contraseña.");
    } finally {
      setBusy(false);
    }
  }

  const badLink = token === null || token === "" || !!linkError;

  return (
    <main className="auth-page">
      <div className="auth-panel">
        <div className="auth-copy">
          <p className="eyebrow light">Portal de clientes</p>
          <h1>Elige una<br /><em>contraseña nueva.</em></h1>
          <p>Al cambiarla se cierran las sesiones abiertas de tu cuenta.</p>
          <span className="auth-mark">GC</span>
        </div>
        <div className="auth-form">
          <a className="back-link" href="/login">← Volver a iniciar sesión</a>
          {token === undefined ? (
            <div role="status" aria-busy="true"><p className="eyebrow">Un momento</p><h2>Cargando…</h2></div>
          ) : done ? (
            <div role="status">
              <p className="eyebrow">Listo</p>
              <h2>Contraseña actualizada.</h2>
              <p>{done}</p>
              <a className="button" href="/login">Iniciar sesión <span>↗</span></a>
            </div>
          ) : badLink ? (
            <div role="alert">
              <p className="eyebrow">No se pudo continuar</p>
              <h2>Este enlace no sirve.</h2>
              <p>{linkError || "El enlace está incompleto. Abre el enlace completo del correo o pide uno nuevo."} Los enlaces sirven una sola vez y vencen a los 60 minutos.</p>
              <a className="button" href="/olvide-contrasena">Pedir un enlace nuevo <span>↗</span></a>
            </div>
          ) : (
            <>
              <p className="eyebrow">Nueva contraseña</p>
              <h2>Casi listo.</h2>
              <form onSubmit={submit} noValidate>
                <label>
                  Contraseña nueva
                  <input required type="password" autoComplete="new-password" placeholder="Mínimo 8 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} />
                </label>
                <label>
                  Repite la contraseña
                  <input required type="password" autoComplete="new-password" placeholder="Vuelve a escribirla" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                  {error && <small className="field-error" role="alert">{error}</small>}
                </label>
                <button className="button" type="submit" disabled={busy}>{busy ? "Guardando…" : <>Guardar contraseña <span>↗</span></>}</button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
