// Prueba de humo de punta a punta contra el sistema en marcha (frontend + proxy + backend + BD).
//
//   bun run smoke                      # contra http://localhost:3000
//   BASE_URL=http://localhost:3000 bun run smoke
//
// Requisitos: servidores arriba, base migrada y sembrada, y DEMO_MODE=true en el backend.
// Crea una cita de prueba en el primer bloque libre de los próximos días.

const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");

type Role = "usuario" | "mecanico" | "admin";
type Json = Record<string, any>;

class Session {
  private cookie = "";
  async request(path: string, init: RequestInit & { json?: unknown } = {}): Promise<{ status: number; body: Json; headers: Headers }> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.cookie) headers.cookie = this.cookie;
    if (init.json !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${BASE}${path}`, {
      method: init.method,
      redirect: init.redirect ?? "manual",
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    });
    const setCookie = res.headers.get("set-cookie");
    const token = setCookie && /gc_token=([^;]*)/.exec(setCookie)?.[1];
    if (token !== null && token !== undefined) this.cookie = token ? `gc_token=${token}` : "";
    const text = await res.text();
    let body: Json = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text.slice(0, 80) };
    }
    return { status: res.status, body, headers: res.headers };
  }
  get = (path: string) => this.request(path);
  post = (path: string, json?: unknown) => this.request(path, { method: "POST", json: json ?? {} });
  patch = (path: string, json?: unknown) => this.request(path, { method: "PATCH", json: json ?? {} });
  async login(role: Role) {
    const res = await this.post("/api/auth/demo-login", { role });
    if (res.status !== 200) throw new Error(`demo-login(${role}) devolvió ${res.status}: ${JSON.stringify(res.body)}. ¿DEMO_MODE=true y db:seed ejecutado?`);
    return res.body.user as Json;
  }
}

let passed = 0;
const failures: string[] = [];
async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  ✘ ${name}\n      ${(error as Error).message}`);
  }
}
function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const expectStatus = (res: { status: number; body: Json }, status: number, what: string) =>
  expect(res.status === status, `${what}: esperaba ${status} y llegó ${res.status} ${JSON.stringify(res.body).slice(0, 160)}`);

const isoDay = (offset: number) => {
  const d = new Date(Date.now() + offset * 86_400_000);
  return d.toISOString().slice(0, 10);
};

async function main() {
  console.log(`\nPrueba de humo contra ${BASE}\n`);
  const client = new Session();
  const mechanic = new Session();
  const admin = new Session();
  const anon = new Session();
  const state: { date?: string; slot?: string; id?: string } = {};

  await step("el backend responde por el proxy de Next (/api/health)", async () => expectStatus(await anon.get("/api/health"), 200, "health"));
  await step("catálogo público con productos", async () => {
    const res = await anon.get("/api/catalog");
    expectStatus(res, 200, "catálogo");
    expect(res.body.products?.length > 0, "el catálogo está vacío (¿falta db:seed?)");
  });
  await step("rutas protegidas sin sesión: 401 en la API y redirección a /login en las pantallas", async () => {
    expectStatus(await anon.get("/api/appointments/my"), 401, "citas sin sesión");
    const page = await anon.request("/portal");
    expect([307, 308].includes(page.status) && String(page.headers.get("location")).includes("/login"), `/portal sin sesión: ${page.status} ${page.headers.get("location")}`);
  });

  await step("las tres sesiones demo se abren sin credenciales", async () => {
    expect((await client.login("usuario")).role === "usuario", "rol cliente");
    expect((await mechanic.login("mecanico")).role === "mecanico", "rol mecánico");
    expect((await admin.login("admin")).role === "admin", "rol admin");
  });
  await step("cada rol llega a su pantalla y se le niegan las ajenas", async () => {
    expectStatus(await client.request("/portal"), 200, "cliente en /portal");
    expect((await client.request("/admin")).headers.get("location")?.endsWith("/portal"), "cliente en /admin debe volver a /portal");
    expectStatus(await mechanic.request("/mecanico"), 200, "mecánico en /mecanico");
    expect((await mechanic.request("/admin")).headers.get("location")?.endsWith("/mecanico"), "mecánico en /admin debe volver a /mecanico");
    expectStatus(await admin.request("/admin"), 200, "admin en /admin");
  });

  await step("el cliente agenda con su vehículo en un bloque libre", async () => {
    const vehicles = await client.get("/api/vehicles");
    expect(vehicles.body.vehicles?.length > 0, "el cliente demo no tiene vehículos");
    const services = (await anon.get("/api/appointments/services")).body.services as Json[];
    const service = services.find((s) => s.category === "serviteca") ?? services[0];
    for (let offset = 8; offset < 40 && !state.slot; offset++) {
      const date = isoDay(offset);
      const slots = (await anon.get(`/api/appointments/availability?date=${date}`)).body.slots as Json[] | undefined;
      const free = slots?.find((s) => s.available);
      if (free) Object.assign(state, { date, slot: free.time });
    }
    expect(state.date && state.slot, "no hay bloques libres en los próximos 40 días");
    const booked = await client.post("/api/appointments", { serviceId: service.id, scheduledDate: state.date, timeSlot: state.slot, vehicleId: vehicles.body.vehicles[0].id, location: "Prueba de humo" });
    expectStatus(booked, 201, "agendar");
    expect(booked.body.appointment.status === "solicitada", "la cita debe quedar solicitada");
    state.id = booked.body.appointment.id;
  });
  await step("el mecánico la ve, la confirma, la inicia y entrega el informe", async () => {
    const agenda = await mechanic.get(`/api/mechanic/agenda?date=${state.date}`);
    expect(agenda.body.agenda?.some((a: Json) => a.id === state.id), "la cita no aparece en la agenda del taller");
    expectStatus(await mechanic.patch(`/api/mechanic/appointments/${state.id}/status`, { status: "confirmada" }), 200, "confirmar");
    const team = await mechanic.get("/api/workers?area=serviteca&active=true");
    expect(team.body.workers?.length > 0, "no hay mecánicos registrados (ejecuta `bun run db:seed`)");
    expectStatus(await mechanic.patch(`/api/mechanic/appointments/${state.id}/status`, { status: "en_proceso", workerId: team.body.workers[0].id }), 200, "iniciar");
    const report = await mechanic.post(`/api/mechanic/appointments/${state.id}/report`, { observations: "Prueba de humo: trabajo completado sin novedades.", finalize: true });
    expectStatus(report, 201, "informe");
    expect(report.body.finalized === true, "debía finalizar la cita");
  });
  await step("el cliente ve la cita finalizada con su informe en el historial", async () => {
    const mine = await client.get("/api/appointments/my");
    const done = mine.body.appointments.find((a: Json) => a.id === state.id);
    expect(done?.status === "finalizada", `estado ${done?.status}`);
    expect(done?.report?.observations?.includes("Prueba de humo") && done.report.mechanicName, "falta el informe o el nombre del mecánico");
  });
  await step("el administrador ve métricas y descarga el respaldo", async () => {
    const metrics = await admin.get("/api/admin/metrics");
    expectStatus(metrics, 200, "métricas");
    expect(metrics.body.appointments.byStatus.finalizada >= 1, "las métricas no cuentan la atención finalizada");
    const csv = await admin.request("/api/admin/export/appointments?format=csv");
    expectStatus(csv, 200, "exportación CSV");
    expect(String(csv.headers.get("content-disposition")).includes("attachment"), "el CSV debe descargarse como adjunto");
  });
  await step("permisos: el cliente no accede a taller ni administración", async () => {
    for (const path of ["/api/admin/metrics", "/api/admin/users", "/api/mechanic/agenda"]) {
      expectStatus(await client.get(path), 403, `cliente en ${path}`);
    }
    expectStatus(await mechanic.get("/api/admin/metrics"), 403, "mecánico en /api/admin/metrics");
  });
  await step("la sesión se cierra de verdad", async () => {
    expectStatus(await client.post("/api/auth/logout"), 200, "logout");
    expectStatus(await client.get("/api/auth/me"), 401, "me tras logout");
  });

  console.log(`\n${failures.length === 0 ? "✅" : "❌"} ${passed} pasos correctos, ${failures.length} con fallas\n`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\n❌ La prueba no pudo ejecutarse: ${(error as Error).message}\n   ¿Están levantados el backend y el frontend? (ver docs/DEVELOPMENT.md)`);
  process.exit(1);
});
