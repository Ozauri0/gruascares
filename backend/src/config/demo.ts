import type { UserRole } from "../types/auth.js";

/**
 * Cuentas demostrativas (ver docs/DECISIONS.md, ADR 008). Usan el dominio reservado `.test`
 * para que nunca se confundan con correos reales ni corporativos.
 * Todo este módulo, `POST /api/auth/demo-login` y el seed demo se eliminan antes de producción (issue #47).
 */
export const DEMO_EMAIL_DOMAIN = "@demo.test";

export const DEMO_ACCOUNTS: Record<UserRole, string> = {
  usuario: `cliente${DEMO_EMAIL_DOMAIN}`,
  mecanico: `mecanico${DEMO_EMAIL_DOMAIN}`,
  admin: `admin${DEMO_EMAIL_DOMAIN}`,
  vendedor: `vendedor${DEMO_EMAIL_DOMAIN}`,
};

export function isDemoEmail(email: string): boolean {
  return email.toLowerCase().endsWith(DEMO_EMAIL_DOMAIN);
}
