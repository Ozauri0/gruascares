"use client";

import type { UserRole } from "../../lib/portal-types";
import { AREA_LABEL } from "../../lib/route-guard";

export type StaffRole = "mecanico" | "grua" | "vendedor" | "admin";
export const STAFF_ROLES: { value: StaffRole; label: string; hint: string }[] = [
  { value: "mecanico", label: "Jefe de taller", hint: "Agenda, solicitudes e informes del taller" },
  { value: "grua", label: "Jefe de grúas", hint: "Solicitudes, asignación y servicios de grúa" },
  { value: "vendedor", label: "Vendedor", hint: "Catálogo, precios y stock" },
  { value: "admin", label: "Administrador", hint: "Todo el panel" },
];

/** Selección de roles: marcar uno o varios; el primero marcado como "inicio" es el principal. Sin marcar = cliente. */
export type RoleChoice = { roles: StaffRole[]; primary: StaffRole | null };

export const toRoleList = (choice: RoleChoice): UserRole[] => {
  if (choice.roles.length === 0) return ["usuario"];
  const primary = choice.primary && choice.roles.includes(choice.primary) ? choice.primary : choice.roles[0];
  return [primary, ...choice.roles.filter((r) => r !== primary)];
};

export function choiceFrom(roles: UserRole[]): RoleChoice {
  const staff = roles.filter((r): r is StaffRole => r !== "usuario");
  return { roles: staff, primary: staff[0] ?? null };
}

export default function RolePicker({ value, onChange, allowClient }: { value: RoleChoice; onChange: (next: RoleChoice) => void; allowClient?: boolean }) {
  const toggle = (role: StaffRole) => {
    const roles = value.roles.includes(role) ? value.roles.filter((r) => r !== role) : [...value.roles, role];
    onChange({ roles, primary: roles.includes(value.primary as StaffRole) ? value.primary : roles[0] ?? null });
  };
  return (
    <fieldset className="role-picker">
      <legend>Roles</legend>
      {STAFF_ROLES.map((r) => (
        <label className="check-row" key={r.value}>
          <input type="checkbox" checked={value.roles.includes(r.value)} onChange={() => toggle(r.value)} />
          <span><strong>{r.label}</strong> <small>{r.hint}</small></span>
        </label>
      ))}
      {value.roles.length > 1 && (
        <label>Página de inicio al entrar
          <select value={value.primary ?? value.roles[0]} onChange={(e) => onChange({ ...value, primary: e.target.value as StaffRole })}>
            {value.roles.map((r) => <option key={r} value={r}>{AREA_LABEL[r]}</option>)}
          </select>
        </label>
      )}
      {allowClient && value.roles.length === 0 && <small>Sin roles marcados: la cuenta queda como cliente.</small>}
    </fieldset>
  );
}
