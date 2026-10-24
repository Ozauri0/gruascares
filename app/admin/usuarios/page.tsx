"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import InnerFooter from "../../components/InnerFooter";
import AdminNav from "../components/AdminNav";
import { ApiError } from "../../lib/api";
import RolePicker, { choiceFrom, toRoleList, type RoleChoice } from "../components/RolePicker";
import type { SessionUser, UserRole } from "../../lib/portal-types";
import { useUsers } from "../../lib/use-users";
import Skeleton from "../../components/Skeleton";
import { useAuth } from "../../lib/auth";
import { formatRut, isValidRut, whatsappUrl } from "../../lib/rut";

const ROLE_FILTERS: { value: UserRole | "todos"; label: string }[] = [
  { value: "todos", label: "Todos los roles" },
  { value: "usuario", label: "Clientes" },
  { value: "mecanico", label: "Mecánicos" },
  { value: "vendedor", label: "Vendedores" },
  { value: "admin", label: "Administradores" },
];

const ROLE_LABELS: Record<UserRole, string> = {
  usuario: "Cliente",
  mecanico: "Mecánico",
  vendedor: "Vendedor",
  admin: "Administrador",
};

type StaffForm = { name: string; rut: string; email: string; phone: string; password: string };

export default function UsersPage() {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<UserRole | "todos">("todos");
  const { user: me } = useAuth();
  const { users, total, loading, error, reload, loadMore, add, toggleActive, changeRoles, remove, hasMore } = useUsers(query, role);
  const [deleting, setDeleting] = useState<SessionUser | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<StaffForm>({ name: "", rut: "", email: "", phone: "", password: "" });
  const [newRoles, setNewRoles] = useState<RoleChoice>({ roles: ["mecanico"], primary: "mecanico" });
  const [editing, setEditing] = useState<SessionUser | null>(null);
  const [editRoles, setEditRoles] = useState<RoleChoice>({ roles: [], primary: null });
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
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

  async function confirmDelete() {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await remove(deleting.id);
      setDeleting(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "No se pudo eliminar el usuario.");
    } finally {
      setDeleteBusy(false);
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
    if (!isValidRut(form.rut)) next.rut = "Ingresa un RUT chileno válido (ej. 12.345.678-5).";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = "Ingresa un correo válido.";
    if (form.phone.trim().length < 6) next.phone = "El teléfono es obligatorio.";
    if (form.password.length < 8) next.password = "Mínimo 8 caracteres (igual que en el backend).";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !validate()) return;
    setSaving(true);
    try {
      const roles = toRoleList(newRoles);
      if (roles[0] === "usuario") {
        setErrors({ form: "Marca al menos un rol (mecánico, vendedor o administrador)." });
        return;
      }
      await add({
        ...form,
        rut: formatRut(form.rut),
        roles: roles as ("mecanico" | "vendedor" | "admin")[],
        email: form.email.trim().toLowerCase(),
      });
      setModal(false);
      setForm({ name: "", rut: "", email: "", phone: "", password: "" });
      setNewRoles({ roles: ["mecanico"], primary: "mecanico" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo crear la cuenta.";
      if (err instanceof ApiError && err.status === 409) {
        if (/rut/i.test(message)) setErrors({ rut: message });
        else if (/correo/i.test(message)) setErrors({ email: message });
        else setErrors({ form: message });
      } else {
        setErrors({ form: message });
      }
    } finally {
      setSaving(false);
    }
  }

  function openEdit(user: SessionUser) {
    setEditing(user);
    setEditRoles(choiceFrom(user.roles ?? [user.role]));
    setEditError("");
  }

  async function saveRoles() {
    if (!editing || editSaving) return;
    setEditSaving(true);
    setEditError("");
    try {
      await changeRoles(editing.id, toRoleList(editRoles));
      setEditing(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "No se pudieron cambiar los roles.");
    } finally {
      setEditSaving(false);
    }
  }

  function set(field: keyof StaffForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <>
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
              <div>
                <Link className="toggle-btn" href="/atencion-presencial">Atención presencial por RUT</Link>{" "}
                <button type="button" className="portal-add" onClick={() => { setErrors({}); setModal(true); }}>
                  + Agregar miembro al equipo
                </button>
              </div>
            </div>

            <div className="filter-bar">
              <input
                className="filter-search"
                type="search"
                placeholder="Buscar por nombre, RUT o correo…"
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
              <Skeleton label="Cargando usuarios…" />
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
                    <tr><th>Nombre / RUT</th><th>Contacto</th><th>Rol</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr>
                  </thead>
                  <tbody>
                    {users.map((user) => {
                      const wa = whatsappUrl(user.phone);
                      return (
                        <tr key={user.id} className={user.isActive ? "" : "row-inactive"}>
                          <td>
                            <strong>{user.name}</strong>
                            {user.rut && <><br /><span className="cell-sub">{formatRut(user.rut)}</span></>}
                          </td>
                          <td>
                            <span className="cell-sub">
                              {user.email ? user.email : "Sin correo (presencial)"}
                              {user.phone && (
                                <>
                                  {" · "}
                                  <a href={`tel:${user.phone}`}>{user.phone}</a>
                                  {" ("}
                                  <a href={`tel:${user.phone}`}>Llamar</a>
                                  {wa && (
                                    <>
                                      {" · "}
                                      <a href={wa} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                                    </>
                                  )}
                                  {")"}
                                </>
                              )}
                            </span>
                          </td>
                          <td><span className="role-badges">{(user.roles?.length ? user.roles : [user.role]).map((r, i) => <span key={r} className={`role-badge role-${r}`} title={i === 0 && (user.roles?.length ?? 0) > 1 ? "Rol principal (su inicio)" : undefined}>{ROLE_LABELS[r]}</span>)}</span></td>
                          <td><span className={user.isActive ? "state-on" : "state-off"}>{user.isActive ? "Activo" : "Inactivo"}</span></td>
                          <td>
                            <button type="button" className="toggle-btn" onClick={() => openEdit(user)}>Roles</button>{" "}
                            <button type="button" className="toggle-btn" onClick={() => void toggle(user.id, user.isActive)}>
                              {user.isActive ? "Desactivar" : "Activar"}
                            </button>
                            {user.id !== me?.id && (
                              <>{" "}<button type="button" className="toggle-btn danger" onClick={() => { setDeleteError(""); setDeleting(user); }}>Eliminar</button></>
                            )}
                          </td>
                        </tr>
                      );
                    })}
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
              <div className="form-row">
                <label>Nombre completo *<input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Nombre y apellido" autoComplete="off" />{errors.name && <small className="field-error">{errors.name}</small>}</label>
                <label>RUT *<input value={form.rut} onChange={(e) => set("rut", e.target.value)} onBlur={() => { if (isValidRut(form.rut)) set("rut", formatRut(form.rut)); }} placeholder="12.345.678-5" autoComplete="off" />{errors.rut && <small className="field-error">{errors.rut}</small>}</label>
              </div>
              <div className="form-row">
                <label>Correo *<input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="nombre@gruascares.cl" autoComplete="off" />{errors.email && <small className="field-error">{errors.email}</small>}</label>
                <label>Teléfono *<input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+56 9 ..." autoComplete="off" />{errors.phone && <small className="field-error">{errors.phone}</small>}</label>
              </div>
              <div className="form-row">
                <label>Contraseña inicial *<input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="new-password" />{errors.password && <small className="field-error">{errors.password}</small>}</label>
              </div>
              <RolePicker value={newRoles} onChange={setNewRoles} />
              {errors.form && <small className="field-error" role="alert">{errors.form}</small>}
              <div className="modal-actions">
                <button type="button" className="modal-cancel" onClick={() => setModal(false)}>Cancelar</button>
                <button type="submit" className="button" disabled={saving}>{saving ? "Creando…" : <>Crear cuenta <span>↗</span></>}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={`Roles de ${editing.name}`} onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h2>Roles de {editing.name}</h2>
              <button type="button" className="modal-close" aria-label="Cerrar" onClick={() => setEditing(null)}>×</button>
            </div>
            <RolePicker value={editRoles} onChange={setEditRoles} allowClient />
            <small className="cell-sub">Los cambios rigen de inmediato; la persona no pierde su sesión.</small>
            {editError && <small className="field-error" role="alert">{editError}</small>}
            <div className="modal-actions">
              <button type="button" className="modal-cancel" onClick={() => setEditing(null)}>Cancelar</button>
              <button type="button" className="button" disabled={editSaving} onClick={() => void saveRoles()}>{editSaving ? "Guardando…" : "Guardar roles"}</button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div className="modal-overlay" onClick={() => !deleteBusy && setDeleting(null)}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-label={`Eliminar a ${deleting.name}`} onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h2>Eliminar usuario</h2>
              <button type="button" className="modal-close" aria-label="Cerrar" disabled={deleteBusy} onClick={() => setDeleting(null)}>×</button>
            </div>
            <p>¿Eliminar definitivamente a <b>{deleting.name}</b> ({deleting.email || formatRut(deleting.rut) || "sin correo"})?</p>
            <p className="cell-sub">Se borrarán también sus vehículos y sus citas. No se puede deshacer. Si solo quieres quitarle el acceso, usa «Desactivar».</p>
            {deleteError && <small className="field-error" role="alert">{deleteError}</small>}
            <div className="modal-actions">
              <button type="button" className="modal-cancel" disabled={deleteBusy} onClick={() => setDeleting(null)}>Cancelar</button>
              <button type="button" className="button button-danger" disabled={deleteBusy} onClick={() => void confirmDelete()}>{deleteBusy ? "Eliminando…" : "Sí, eliminar"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
