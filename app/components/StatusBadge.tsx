import type { AppointmentStatus } from "../lib/portal-types";

const LABELS: Record<AppointmentStatus, string> = {
  solicitada: "Solicitada",
  confirmada: "Confirmada",
  en_proceso: "En Taller",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
};

export default function StatusBadge({ status }: { status: AppointmentStatus }) {
  return <span className={`status-badge status-${status}`}>{LABELS[status]}</span>;
}
