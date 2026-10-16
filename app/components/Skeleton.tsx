/** Marcador de carga: bloques grises animados en lugar de un texto "Cargando…", para que la pantalla no salte al llegar los datos. */
export default function Skeleton({ label, kpis = false, rows = 3 }: { label: string; kpis?: boolean; rows?: number }) {
  return (
    <div className="skeleton-wrap" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {kpis && (
        <div className="kpi-grid" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skeleton-kpi" />)}
        </div>
      )}
      <div className="skeleton-rows" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton skeleton-row" />)}
      </div>
    </div>
  );
}
