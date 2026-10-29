"use client";

import { FormEvent, useEffect, useState } from "react";
import AreaNav from "../../components/AreaNav";
import Icon from "../../components/Icon";
import InnerFooter from "../../components/InnerFooter";
import LogoutButton from "../../components/LogoutButton";
import { useAuth } from "../../lib/auth";

/** Perfil del usuario (cliente, mecánico, admin…): nombre y teléfono editables; el correo y el rol no. */
export default function ProfilePage() {
  const { user, loading, updateProfile, logoutAll } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<{ name?: string; phone?: string; form?: string }>({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [allError, setAllError] = useState("");

  const userId = user?.id;
  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- el formulario parte de los datos de la sesión cuando llegan
    setName(user.name);
    setPhone(user.phone ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar de usuario, no al guardar
  }, [userId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = "El nombre es obligatorio (mínimo 2 caracteres).";
    if (phone.trim().length < 6) next.phone = "El teléfono es obligatorio (mínimo 6 caracteres).";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    try {
      await updateProfile({ name, phone });
      setSaved(true);
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : "No se pudo guardar el perfil." });
    } finally {
      setBusy(false);
    }
  }

  async function closeEverywhere() {
    setAllError("");
    try {
      await logoutAll();
      window.location.href = "/login";
    } catch (err) {
      setAllError(err instanceof Error ? err.message : "No se pudieron cerrar las sesiones.");
    }
  }

  const unchanged = !!user && name.trim() === user.name && phone.trim() === (user.phone ?? "");

  return (
    <>
      <main className="inner-page portal-page">
        <section className="page-intro wrap portal-intro">
          <div>
            <p className="eyebrow">Mi Cuenta</p>
            <h1>Mi <em>perfil.</em></h1>
          </div>
          <div>
            <p className="portal-subtext">Actualiza tu nombre y teléfono de contacto. Tu correo y tu RUT no se pueden cambiar desde aquí.</p>
            <LogoutButton />
          </div>
        </section>

        <div className="portal-stack wrap">
          <AreaNav />
          <nav className="portal-nav-tabs" aria-label="Secciones del portal">
            <a href="/portal" className="portal-nav-tab"><span className="tab-icon"><Icon name="home" bare /></span><span>Mi Resumen</span></a>
            <a href="/portal/citas" className="portal-nav-tab"><span className="tab-icon"><Icon name="clipboard" bare /></span><span>Mis Citas</span></a>
            <a href="/portal/vehiculos" className="portal-nav-tab"><span className="tab-icon"><Icon name="car" bare /></span><span>Mis Vehículos</span></a>
            <a href="/portal/perfil" className="portal-nav-tab active"><span className="tab-icon"><Icon name="user" bare /></span><span>Mi Perfil</span></a>
            <a href="/agendar" className="portal-nav-tab portal-nav-cta"><span className="tab-icon"><Icon name="calendar" bare /></span><span>Agendar</span></a>
          </nav>

          {loading || !user ? (
            <div className="portal-empty-card"><p>Cargando tu perfil…</p></div>
          ) : (
            <div className="profile-grid">
              <form className="portal-card profile-card" onSubmit={submit} noValidate>
                <h2>Mis datos</h2>
                <label>
                  Nombre completo *
                  <input required value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} autoComplete="name" />
                  {errors.name && <small className="field-error">{errors.name}</small>}
                </label>
                <label>
                  Teléfono *
                  <input required type="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setSaved(false); }} autoComplete="tel" />
                  {errors.phone && <small className="field-error">{errors.phone}</small>}
                </label>
                <label>
                  Correo electrónico
                  <input value={user.email} readOnly disabled />
                </label>
                {user.rut && (
                  <label>
                    RUT
                    <input value={user.rut} readOnly disabled />
                  </label>
                )}
                {errors.form && <small className="field-error" role="alert">{errors.form}</small>}
                {saved && <small className="profile-saved" role="status">Perfil actualizado.</small>}
                <button className="button" type="submit" disabled={busy || unchanged}>{busy ? "Guardando…" : <>Guardar cambios <span>↗</span></>}</button>
              </form>

              <section className="portal-card profile-card" aria-label="Seguridad">
                <h2>Seguridad</h2>
                <p>Si perdiste un equipo o usaste un computador ajeno, cierra todas tus sesiones. Tendrás que iniciar sesión de nuevo en cada dispositivo.</p>
                {confirmAll ? (
                  <div className="profile-confirm" role="alert">
                    <p>¿Cerrar la sesión en todos tus dispositivos, también en este?</p>
                    <div className="profile-confirm-actions">
                      <button type="button" className="button" onClick={() => void closeEverywhere()}>Sí, cerrar todas</button>
                      <button type="button" className="button button-secondary" onClick={() => setConfirmAll(false)}>Cancelar</button>
                    </div>
                    {allError && <small className="field-error">{allError}</small>}
                  </div>
                ) : (
                  <button type="button" className="button button-secondary" onClick={() => setConfirmAll(true)}>Cerrar sesión en todos los dispositivos</button>
                )}
                <p className="auth-note">¿Quieres cambiar tu contraseña? Cierra sesión y usa «¿Olvidaste tu contraseña?»: te enviamos un enlace al correo.</p>
              </section>
            </div>
          )}
        </div>
      </main>
      <InnerFooter />
    </>
  );
}
