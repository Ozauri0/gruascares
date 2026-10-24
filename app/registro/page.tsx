"use client";

import { FormEvent, useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import { HOME_FOR_ROLE, useAuth } from "../lib/auth";
import { isSafeInternalPath, rememberRedirect } from "../lib/post-login";
import { formatRut, isValidRut } from "../lib/rut";
import ResendVerification from "../components/ResendVerification";

export default function RegisterPage() {
  const { user, register } = useAuth();
  const [name, setName] = useState("");
  const [rut, setRut] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<{ name?: string; rut?: string; email?: string; phone?: string; password?: string; confirmPassword?: string; form?: string }>({});
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
    if (!isValidRut(rut)) next.rut = "Ingresa un RUT chileno válido (ej. 12.345.678-5).";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = "Ingresa un correo válido.";
    if (phone.trim().length < 6) next.phone = "El teléfono es obligatorio (mínimo 6 caracteres).";
    if (password.length < 8) next.password = "Mínimo 8 caracteres (igual que en el backend).";
    else if (confirmPassword !== password) next.confirmPassword = "Las contraseñas no coinciden.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const formattedRut = formatRut(rut);
    setRut(formattedRut);
    setBusy(true);
    try {
      const result = await register({ name: name.trim(), rut: formattedRut, email: email.trim(), password, phone: phone.trim() });
      setSentTo(result.email);
      setBusy(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo crear la cuenta.";
      if (err instanceof ApiError && err.status === 409) {
        if (/rut/i.test(message)) setErrors({ rut: message });
        else if (/correo/i.test(message)) setErrors({ email: message });
        else setErrors({ form: message });
      } else {
        setErrors({ form: message });
      }
      setBusy(false);
    }
  }

  return (
    <>
      <main className="auth-page">
        <div className="auth-panel">
          <div className="auth-copy">
            <p className="eyebrow light">Portal de clientes</p>
            <h1>Crea tu cuenta<br /><em>en un minuto.</em></h1>
            <p>Registra tus vehículos, agenda servicios y sigue tus atenciones desde un solo lugar.</p>
            <span className="auth-mark">GC</span>
          </div>
          <div className="auth-form">
            <a className="back-link" href="/">← Volver al inicio</a>
            {sentTo ? (
              <div className="verify-sent" role="status">
                <p className="eyebrow">Revisa tu correo</p>
                <h2>Casi listo.</h2>
                <p>Te enviamos un enlace de confirmación a <b>{sentTo}</b>. Ábrelo para activar tu cuenta; vence en 24 horas.</p>
                <p className="verify-hint">Si no lo ves, revisa la carpeta de spam.</p>
                <ResendVerification email={sentTo} />
                <p className="auth-note">¿Ya confirmaste? <a href="/login">Inicia sesión</a></p>
              </div>
            ) : (
              <>
                <p className="eyebrow">Registro</p>
                <h2>Hola, ¿nos presentamos?</h2>
                <p className="verify-hint">
                  Si ya te atendimos presencialmente en el taller, al registrarte con tu RUT verás automáticamente tus vehículos e historial tras confirmar tu correo.
                </p>
                <form onSubmit={submit} noValidate>
                  <div className="form-row">
                    <label>
                      Nombre completo *
                      <input required placeholder="Tu nombre" value={name} onChange={(e) => setName(e.target.value)} />
                      {errors.name && <small className="field-error">{errors.name}</small>}
                    </label>
                    <label>
                      RUT *
                      <input
                        required
                        placeholder="12.345.678-5"
                        value={rut}
                        onChange={(e) => setRut(e.target.value)}
                        onBlur={() => {
                          if (isValidRut(rut)) setRut(formatRut(rut));
                        }}
                      />
                      {errors.rut && <small className="field-error">{errors.rut}</small>}
                    </label>
                  </div>
                  <label>
                    Correo electrónico *
                    <input required type="email" placeholder="nombre@empresa.cl" value={email} onChange={(e) => setEmail(e.target.value)} />
                    {errors.email && <small className="field-error">{errors.email}</small>}
                  </label>
                  <label>
                    Teléfono *
                    <input required type="tel" placeholder="+56 9 ..." value={phone} onChange={(e) => setPhone(e.target.value)} />
                    {errors.phone && <small className="field-error">{errors.phone}</small>}
                  </label>
                  <div className="form-row">
                    <label>
                      Contraseña *
                      <input required type="password" placeholder="Mínimo 8 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} />
                      {errors.password && <small className="field-error">{errors.password}</small>}
                    </label>
                    <label>
                      Repite la contraseña *
                      <input required type="password" placeholder="Vuelve a escribirla" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                      {errors.confirmPassword && <small className="field-error">{errors.confirmPassword}</small>}
                    </label>
                  </div>
                  {errors.form && <small className="field-error" role="alert">{errors.form}</small>}
                  <button className="button" type="submit" disabled={busy}>{busy ? "Creando cuenta…" : <>Crear cuenta <span>↗</span></>}</button>
                </form>
                <p className="auth-note">¿Ya tienes cuenta? <a href="/login">Inicia sesión</a></p>
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
