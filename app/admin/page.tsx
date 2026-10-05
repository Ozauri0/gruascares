import InnerFooter from "../components/InnerFooter";
import InnerHeader from "../components/InnerHeader";
import LogoutButton from "../components/LogoutButton";
import StatusBadge from "../components/StatusBadge";
import { MOCK_METRICS } from "../lib/admin-mocks";
import { formatPlate } from "../lib/plate";

// Panel de administración (T2.10). Métricas demostrativas hasta
// conectar GET /api/admin/metrics (T1.8) y el middleware por rol (T2.3).
export default function AdminPage() {
  const maxCategory = Math.max(...MOCK_METRICS.byCategory.map((item) => item.count));
  return (
    <>
      <InnerHeader />
      <main className="inner-page portal-page">
        <section className="page-intro wrap portal-intro">
          <div>
            <p className="eyebrow">Administración</p>
            <h1>Panel <em>general.</em></h1>
          </div>
          <div><p>Resumen del negocio: citas de hoy, demanda por servicio y base de clientes de Grúas Cares.</p><LogoutButton /></div>
        </section>

        <div className="portal-stack wrap">
          <nav className="admin-nav" aria-label="Secciones de administración">
            <a href="/admin/usuarios">Usuarios y personal <span>→</span></a>
            <a href="/admin/calendario">Calendario maestro <span>→</span></a>
            <a href="/admin/catalogo">Catálogo y precios <span>→</span></a>
          </nav>
          <section className="kpi-grid" aria-label="Indicadores clave">
            <div className="kpi-card kpi-dark"><strong>{MOCK_METRICS.appointmentsToday}</strong><span>Citas hoy</span></div>
            <div className="kpi-card"><strong>{MOCK_METRICS.appointmentsWeek}</strong><span>Citas esta semana</span></div>
            <div className="kpi-card"><strong>{MOCK_METRICS.totalClients}</strong><span>Clientes registrados</span></div>
            <div className="kpi-card"><strong>{MOCK_METRICS.totalVehicles}</strong><span>Vehículos atendidos</span></div>
          </section>

          <section aria-label="Demanda por servicio">
            <div className="portal-row-head">
              <h2>Servicios más solicitados</h2>
              <span className="catalog-count">Semana actual</span>
            </div>
            <div className="demand-card">
              {MOCK_METRICS.byCategory.map((item) => (
                <div className="demand-row" key={item.category}>
                  <div className="demand-label"><strong>{item.label}</strong><span>{item.count} citas</span></div>
                  <div className="demand-track"><div className="demand-fill" style={{ width: `${Math.round((item.count / maxCategory) * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          </section>

          <section aria-label="Agenda de hoy">
            <div className="portal-row-head">
              <h2>Hoy en el taller</h2>
              <span className="catalog-count">{MOCK_METRICS.todayAgenda.length} atenciones</span>
            </div>
            <div className="compact-list">
              {MOCK_METRICS.todayAgenda.map((item) => (
                <div className="compact-row" key={item.id}>
                  <span className="compact-time">{item.timeSlot}</span>
                  <strong>{item.serviceName} <small>· {item.clientName} · {formatPlate(item.vehiclePlate)}</small></strong>
                  <StatusBadge status={item.status} />
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
      <InnerFooter />
    </>
  );
}
