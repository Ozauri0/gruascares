"use client";

import { useEffect, useState } from "react";
import InnerFooter from "../../components/InnerFooter";
import InnerHeader from "../../components/InnerHeader";
import { MOCK_USERS } from "../../lib/admin-mocks";
import type { SessionUser, UserRole } from "../../lib/portal-types";

const ROLE_FILTERS: { value: UserRole | "todos"; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "usuario", label: "Clientes" },
  { value: "mecanico", label: "Mecánicos" },
  { value: "admin", label: "Admins" },
];

const ROLE_LABELS: Record<UserRole, string> = {
  usuario: "Cliente",
  mecanico: "Mecánico",
  admin: "Admin",
};

type StaffForm = { name: string; email: string; phone: string; role: "mecanico" | "admin"; password: string };

export default function UsersPage() {
  const [users, setUsers] = useState<SessionUser[]>(MOCK_USERS);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<UserRole | "todos">("todos");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<StaffForm>({ name: "", email: "", phone: "", role: "mecanico", password: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof StaffForm, string>>>({});

  const filtered = users.filter((user) => {
    const matchesRole = role === "todos" || user.role === role;
    const text = `${user.name} ${user.email}`.toLowerCase();
    return matchesRole && text.includes(query.trim().toLowerCase());
  });

  useEffect(() => {
    if (!modal) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModal(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);

  function toggleActive(id: string) {
    setUsers((current) => current.map((user) => (user.id === id ? { ...user, isActive: !user.isActive } : user)));
  }

  function validate(): boolean {
    const next: Partial<Record<keyof StaffForm, string>> = {};
    if (form.name.trim().length < 2) next.name = "El nombre es obligatorio.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = "Ingresa un correo válido.";
    } else if (users.some((user) => user.email === form.email.trim().toLowerCase())) {
      next.email = "Ese correo ya está registrado.";
    }
    if (form.password.length < 6) next.password = "Mínimo 6 caracteres (igual que en el backend).";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    setUsers((current) => [
      {
        id: `u-${Date.now()}`,
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        role: form.role,
        phone: form.phone.trim() === "" ? null : form.phone.trim(),
        isActive: true,
        createdAt: new Date().toISOString(),
      },
      ...current,
    ]);
    setModal(false);
    setForm({ name: "", email: "", phone: "", role: "mecanico", password: "" });
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
          <p>Busca clientes, gestiona mecánicos y administradores, y controla quién puede entrar a cada panel.</p>
        </section>

        <div className="portal-stack wrap">
          <section aria-label="Gestión de usuarios">
            <div className="portal-toolbar">
              <a className="portal-back" href="/admin">← Volver al panel</a>
              <button type="button" className="portal-add" onClick={() => { setErrors({}); setModal(true); }}>+ Nuevo miembro</button>
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

            {filtered.length === 0 ? (
              <p className="portal-empty">Sin resultados para esa búsqueda.</p>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr><th>Nombre</th><th>Contacto</th><th>Rol</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr>
                  </thead>
                  <tbody>
                    {filtered.map((user) => (
                      <tr key={user.id} className={user.isActive ? "" : "row-inactive"}>
                        <td><strong>{user.name}</strong></td>
                        <td><span className="cell-sub">{user.email}{user.phone ? ` · ${user.phone}` : ""}</span></td>
                        <td><span className={`role-badge role-${user.role}`}>{ROLE_LABELS[user.role]}</span></td>
                        <td><span className={user.isActive ? "state-on" : "state-off"}>{user.isActive ? "Activo" : "Inactivo"}</span></td>
                        <td>
                          <button type="button" className="toggle-btn" onClick={() => toggleActive(user.id)}>
                            {user.isActive ? "Desactivar" : "Activar"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="table-note">{filtered.length} de {users.length} usuarios · Los cambios se sincronizarán con la API de gestión.</p>
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
                <label>Contraseña inicial *<input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="Mínimo 6 caracteres" autoComplete="new-password" />{errors.password && <small className="field-error">{errors.password}</small>}</label>
              </div>
              <div className="modal-actions">
                <button type="button" className="modal-cancel" onClick={() => setModal(false)}>Cancelar</button>
                <button type="submit" className="button">Crear cuenta <span>↗</span></button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
