"use client";

import { useEffect, useState } from "react";
import InnerFooter from "../../components/InnerFooter";
import InnerHeader from "../../components/InnerHeader";
import AdminNav from "../components/AdminNav";
import { ApiError } from "../../lib/api";
import type { UserRole } from "../../lib/portal-types";
import { useUsers } from "../../lib/use-users";

const ROLE_FILTERS: { value: UserRole | "todos"; label: string }[] = [
  { value: "todos", label: "Todos los roles" },
  { value: "usuario", label: "Clientes" },
  { value: "mecanico", label: "Mecánicos" },
  { value: "admin", label: "Administradores" },
];

const ROLE_LABELS: Record<UserRole, string> = {
  usuario: "Cliente",
  mecanico: "Mecánico",
  admin: "Administrador",
};

type StaffForm = { name: string; email: string; phone: string; role: "mecanico" | "admin"; password: string };

export default function UsersPage() {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<UserRole | "todos">("todos");
  const { users, total, loading, error, reload, loadMore, add, toggleActive, hasMore } = useUsers(query, role);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<StaffForm>({ name: "", email: "", phone: "", role: "mecanico", password: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof StaffForm | "form", string>>>({});
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [moreLoading, setMoreLoading] = useState(false);

  useEffect(() => {
    if (!modal) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModal(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);

  async function toggle(id: string, isActive: boolean) {
    setActionError("");
    try {
      await toggleActive(id, !isActive);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo cambiar el estado del usuario.");
    }
  }

  async function showMore() {
    setMoreLoading(true);
    setActionError("");
    try {
      await loadMore();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudieron cargar más usuarios.");
    } finally {
      setMoreLoading(false);
    }
  }

  function validate(): boolean {
    const next: Partial<Record<keyof StaffForm, string>> = {};
    if (form.name.trim().length < 2) next.name = "El nombre es obligatorio.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = "Ingresa un correo válido.";
    if (form.password.length < 8) next.password = "Mínimo 8 caracteres (igual que en el backend).";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !validate()) return;
    setSaving(true);
    try {
      await add({ ...form, email: form.email.trim().toLowerCase() });
      setModal(false);
      setForm({ name: "", email: "", phone: "", role: "mecanico", password: "" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo crear la cuenta.";
      setErrors(err instanceof ApiError && err.status === 409 ? { email: message } : { form: message });
    } finally {
      setSaving(false);
    }
  }

  function set(field: keyof StaffForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <>
      <InnerHeader />
      <main className="inner-page portal-page">
        <section className="page-intro wrap portal-intro">
          <div>
            <p className="eyebrow">Administración</p>
            <h1>Usuarios y <em>personal.</em></h1>
          </div>
          <div>
            <p className="portal-subtext">Directorio de clientes registrados y gestión de roles y accesos para el equipo.</p>
          </div>
        </section>

        <div className="portal-stack wrap">
          <AdminNav current="usuarios" />

          <section aria-label="Gestión de usuarios">
            <div className="portal-toolbar">
              <div className="portal-toolbar-left">
                <span className="portal-badge-counter">{loading ? "Cargando…" : error ? "No disponible" : `${total} ${total === 1 ? "usuario" : "usuarios"}`}</span>
              </div>
              <button type="button" className="portal-add" onClick={() => { setErrors({}); setModal(true); }}>
                + Agregar miembro al equipo
              </button>
            </div>

            <div className="filter-bar">
              <input
                className="filter-search"
                type="search"
                placeholder="Buscar por nombre o correo…"
                aria-label="Buscar usuarios"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className="filter-pills" role="tablist" aria-label="Filtrar por rol">
                {ROLE_FILTERS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="tab"
                    aria-selected={role === option.value}
                    className={role === option.value ? "filter-pill selected" : "filter-pill"}
                    onClick={() => setRole(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {actionError && <p className="field-error" role="alert">{actionError}</p>}

            {loading ? (
              <div className="portal-empty-card" aria-busy="true"><p>Cargando usuarios…</p></div>
            ) : error ? (
              <div className="portal-empty-card" role="alert">
                <p>{error}</p>
                <button type="button" className="button button-sm" onClick={reload}>Reintentar</button>
              </div>
            ) : users.length === 0 ? (
              <p className="portal-empty">Sin resultados para esa búsqueda.</p>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr><th>Nombre</th><th>Contacto</th><th>Rol</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className={user.isActive ? "" : "row-inactive"}>
                        <td><strong>{user.name}</strong></td>
                        <td><span className="cell-sub">{user.email}{user.phone ? ` · ${user.phone}` : ""}</span></td>
                        <td><span className={`role-badge role-${user.role}`}>{ROLE_LABELS[user.role]}</span></td>
                        <td><span className={user.isActive ? "state-on" : "state-off"}>{user.isActive ? "Activo" : "Inactivo"}</span></td>
                        <td>
                          <button type="button" className="toggle-btn" onClick={() => void toggle(user.id, user.isActive)}>
                            {user.isActive ? "Desactivar" : "Activar"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!loading && !error && (
              <p className="table-note">
                {users.length} de {total} usuarios.{" "}
                {hasMore && (
                  <button type="button" className="toggle-btn" disabled={moreLoading} onClick={() => void showMore()}>
                    {moreLoading ? "Cargando…" : "Ver más"}
                  </button>
                )}
              </p>
            )}
          </section>
        </div>
      </main>
      <InnerFooter />

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Dar de alta a un miembro del equipo"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <h2>Nuevo miembro</h2>
              <button type="button" className="modal-close" aria-label="Cerrar" onClick={() => setModal(false)}>×</button>
            </div>
            <form onSubmit={submit} noValidate>
              <label>Nombre completo *<input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Nombre y apellido" autoComplete="off" />{errors.name && <small className="field-error">{errors.name}</small>}</label>
              <div className="form-row">
                <label>Correo *<input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="nombre@gruascares.cl" autoComplete="off" />{errors.email && <small className="field-error">{errors.email}</small>}</label>
                <label>Teléfono<input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+56 9 ..." autoComplete="off" /></label>
              </div>
              <div className="form-row">
                <label>Rol *<select value={form.role} onChange={(e) => set("role", e.target.value)}><option value="mecanico">Mecánico</option><option value="admin">Administrador</option></select></label>
                <label>Contraseña inicial *<input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="new-password" />{errors.password && <small className="field-error">{errors.password}</small>}</label>
              </div>
              {errors.form && <small className="field-error" role="alert">{errors.form}</small>}
              <div className="modal-actions">
                <button type="button" className="modal-cancel" onClick={() => setModal(false)}>Cancelar</button>
                <button type="submit" className="button" disabled={saving}>{saving ? "Creando…" : <>Crear cuenta <span>↗</span></>}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
