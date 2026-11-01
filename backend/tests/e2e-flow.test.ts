import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db/connection.js";
import { testOutbox } from "../src/services/email/email.service.js";
import { CRANE_TRANSFER, cookieFor, dbReady, futureDate, resetDb, seedBasics, type Seed } from "./db.js";
import { startServer, type TestServer } from "./helpers.js";

/**
 * Recorrido completo del sistema con los tres roles (cliente, mecánico, administrador), pasando por
 * el HTTP real y la base de datos: agendar → confirmar → atender → informe → correo → historial.
 */
let server: TestServer;
let seed: Seed;
beforeAll(async () => {
  if (dbReady) server = await startServer();
});
afterAll(async () => {
  if (server) await server.close();
});
beforeEach(async () => {
  if (!dbReady) return;
  await resetDb();
  seed = await seedBasics();
  testOutbox.length = 0;
});

type U = { id: string; email: string; name: string; role: "admin" | "mecanico" | "usuario" | "vendedor" | "grua" | "grua"; tokenVersion?: number };
const call = async (user: U | null, method: string, path: string, body?: unknown) => {
  const headers = user ? cookieFor(user) : { "Content-Type": "application/json" };
  const res = await fetch(`${server.url}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
};
const waitFor = async <T>(fn: () => T | undefined | false): Promise<T> => {
  for (let i = 0; i < 40; i++) {
    const value = fn();
    if (value) return value as T;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("timeout");
};

describe.skipIf(!dbReady)("INT-12: flujo completo cliente → mecánico → informe → historial", () => {
  test("agendar, confirmar, atender, informar, correo al cliente e historial en el portal", async () => {
    const date = futureDate(3);

    // 1) El cliente agenda con su vehículo y recibe el correo de confirmación
    const booked = await call(seed.clientA, "POST", "/api/appointments", {
      serviceId: seed.serviceAceite.id, scheduledDate: date, timeSlot: "10:30", vehicleId: seed.vehicleA.id, location: "Taller Villarrica", notes: "Ruido al frenar",
    });
    expect(booked.status).toBe(201);
    const id = booked.body.appointment.id as string;
    expect(booked.body.appointment.status).toBe("solicitada");
    await waitFor(() => testOutbox.find((m) => m.to === seed.clientA.email && m.subject.includes("Confirmación")));

    // 2) La agenda del taller la muestra sin mecánico asignado
    const agenda = await call(seed.mechanic, "GET", `/api/mechanic/agenda?date=${date}`);
    const item = agenda.body.agenda.find((a: any) => a.id === id);
    expect(item).toMatchObject({ status: "solicitada", workerId: null });
    expect(item.client.name).toBe("Cliente A");
    expect(item.vehicle.plate).toBe("ABCD12");

    // 3) El administrador asigna al trabajador; el jefe de taller confirma e inicia la atención
    expect((await call(seed.admin, "PATCH", `/api/admin/appointments/${id}/assign`, { workerId: seed.mech.id })).status).toBe(200);
    expect((await call(seed.mechanic, "PATCH", `/api/mechanic/appointments/${id}/status`, { status: "confirmada" })).status).toBe(200);
    expect((await call(seed.mechanic, "PATCH", `/api/mechanic/appointments/${id}/status`, { status: "en_proceso" })).status).toBe(200);

    // 4) El cliente ve el avance en su portal (aún sin informe)
    const midway = await call(seed.clientA, "GET", "/api/appointments/my");
    expect(midway.body.appointments[0]).toMatchObject({ status: "en_proceso", report: null });

    // 5) El mecánico registra el informe y finaliza: correo al cliente + odómetro actualizado
    const report = await call(seed.mechanic, "POST", `/api/mechanic/appointments/${id}/report`, {
      observations: "Cambio de aceite y filtro. Pastillas delanteras al 30%.", partsReplaced: "Filtro, 5L aceite", mileageAtService: 1800, recommendations: "Revisar pastillas en 5.000 km",
    });
    expect(report.status).toBe(201);
    expect(report.body.finalized).toBe(true);
    const mail = await waitFor(() => testOutbox.find((m) => m.to === seed.clientA.email && m.subject.startsWith("Hoja de Atención Finalizada")));
    expect(mail.html).toContain("Pastillas delanteras al 30%");
    expect(mail.html).toContain("ABCD12");
    expect((await sql`select mileage from vehicles where id = ${seed.vehicleA.id}`)[0].mileage).toBe(1800);

    // 6) Historial del cliente: finalizada, con el informe y el nombre del mecánico
    const history = await call(seed.clientA, "GET", "/api/appointments/my");
    const done = history.body.appointments.find((a: any) => a.id === id);
    expect(done.status).toBe("finalizada");
    expect(done.report).toMatchObject({ observations: "Cambio de aceite y filtro. Pastillas delanteras al 30%.", mechanicName: "Pedro Taller", mileageAtService: 1800 });
    expect((await call(seed.clientA, "GET", `/api/appointments/${id}/report`)).status).toBe(200);

    // 7) El administrador lo ve reflejado en métricas y auditoría
    const metrics = await call(seed.admin, "GET", "/api/admin/metrics");
    expect(metrics.body.vehicles.served).toBe(1);
    expect(metrics.body.appointments.byStatus.finalizada).toBe(1);
    const audit = await (async () => {
      for (let i = 0; i < 40; i++) {
        const rows = await sql`select action from audit_logs`;
        const names = rows.map((r) => r.action as string);
        if (["APPOINTMENT_CREATE", "APPOINTMENT_STATUS_CHANGE", "APPOINTMENT_FINALIZED", "APPOINTMENT_REASSIGNED"].every((a) => names.includes(a))) return names;
        await new Promise((r) => setTimeout(r, 25));
      }
      return [] as string[];
    })();
    expect(audit).toContain("APPOINTMENT_FINALIZED");
    expect(audit).toContain("APPOINTMENT_REASSIGNED");
  });

  test("sobrecupo: la quinta persona no entra a un bloque con 4 cupos; al cancelar uno, se libera", async () => {
    const date = futureDate(4);
    const book = (user: U | null, extra: Record<string, unknown> = {}) =>
      call(user, "POST", "/api/appointments", { serviceId: seed.serviceGrua.id, scheduledDate: date, timeSlot: "09:30", ...CRANE_TRANSFER, ...extra });
    const first = await book(seed.clientA);
    const rest = [await book(seed.clientB), await book(seed.seller), await book(seed.mechanic)];
    expect([first.status, ...rest.map((r) => r.status)]).toEqual([201, 201, 201, 201]);

    const slotsBefore = await call(null, "GET", `/api/appointments/availability?date=${date}`);
    expect(slotsBefore.body.slots.find((s: any) => s.time === "09:30")).toMatchObject({ available: false, capacityRemaining: 0 });

    const fifth = await book(seed.admin); // una quinta persona (con sesión) no entra: el horario se llenó
    expect(fifth.status).toBe(409);
    expect(fifth.body.message).toContain("cupos");
    expect((await book(null)).status).toBe(401); // sin sesión ni se evalúa el cupo

    expect((await call(seed.clientA, "PATCH", `/api/appointments/${first.body.appointment.id}/cancel`)).status).toBe(200);
    expect((await book(seed.admin)).status).toBe(201);
  });

  test("cancelación: el cliente cancela antes de entrar a taller, no después", async () => {
    const date = futureDate(5);
    const booked = await call(seed.clientA, "POST", "/api/appointments", { serviceId: seed.serviceAceite.id, scheduledDate: date, timeSlot: "08:30" });
    const id = booked.body.appointment.id as string;
    await call(seed.mechanic, "PATCH", `/api/mechanic/appointments/${id}/status`, { status: "confirmada" });
    await call(seed.mechanic, "PATCH", `/api/mechanic/appointments/${id}/status`, { status: "en_proceso", workerId: seed.mech.id });
    expect((await call(seed.clientA, "PATCH", `/api/appointments/${id}/cancel`)).status).toBe(409);

    const other = await call(seed.clientA, "POST", "/api/appointments", { serviceId: seed.serviceAceite.id, scheduledDate: date, timeSlot: "09:30" });
    expect((await call(seed.clientA, "PATCH", `/api/appointments/${other.body.appointment.id}/cancel`)).status).toBe(200);
    expect((await call(seed.clientA, "PATCH", `/api/appointments/${other.body.appointment.id}/cancel`)).status).toBe(409);
  });

  test("bloqueo de horarios: un día bloqueado no admite citas hasta desbloquearlo", async () => {
    const date = futureDate(6);
    const block = await call(seed.admin, "POST", "/api/admin/blocked-dates", { date, reason: "Feriado de prueba" });
    expect(block.status).toBe(201);

    const slots = await call(null, "GET", `/api/appointments/availability?date=${date}`);
    expect(slots.body.slots.every((s: any) => s.available === false && s.reason === "Feriado de prueba")).toBe(true);
    const denied = await call(seed.clientA, "POST", "/api/appointments", { serviceId: seed.serviceGrua.id, scheduledDate: date, timeSlot: "10:30", ...CRANE_TRANSFER });
    expect(denied.status).toBe(409);
    expect(denied.body.message).toContain("Feriado de prueba");

    expect((await call(seed.admin, "DELETE", `/api/admin/blocked-dates/${block.body.blockedDate.id}`)).status).toBe(200);
    expect((await call(seed.clientA, "POST", "/api/appointments", { serviceId: seed.serviceGrua.id, scheduledDate: date, timeSlot: "10:30", ...CRANE_TRANSFER })).status).toBe(201);
  });

  test("permisos cruzados: cada rol y cada cliente solo accede a lo suyo", async () => {
    const booked = await call(seed.clientA, "POST", "/api/appointments", { serviceId: seed.serviceAceite.id, scheduledDate: futureDate(7), timeSlot: "10:30", vehicleId: seed.vehicleA.id });
    const id = booked.body.appointment.id as string;
    await sql`insert into service_records (appointment_id, worker_id, authored_by, observations) values (${id}, ${seed.mech.id}, ${seed.mechanic.id}, 'Informe privado de A')`;

    // El cliente B no ve, cancela ni lee el informe de la cita de A; ni usa su vehículo
    expect((await call(seed.clientB, "GET", `/api/appointments/${id}`)).status).toBe(403);
    expect((await call(seed.clientB, "PATCH", `/api/appointments/${id}/cancel`)).status).toBe(403);
    expect((await call(seed.clientB, "GET", `/api/appointments/${id}/report`)).status).toBe(403);
    expect((await call(seed.clientB, "GET", "/api/appointments/my")).body.appointments).toHaveLength(0);
    expect((await call(seed.clientB, "GET", `/api/vehicles/${seed.vehicleA.id}`)).status).toBe(403);
    expect((await call(seed.clientB, "PATCH", `/api/vehicles/${seed.vehicleA.id}`, { mileage: 5 })).status).toBe(403);
    expect((await call(seed.clientB, "DELETE", `/api/vehicles/${seed.vehicleA.id}`)).status).toBe(403);
    expect((await call(seed.clientB, "POST", "/api/appointments", { serviceId: seed.serviceAceite.id, scheduledDate: futureDate(8), timeSlot: "10:30", vehicleId: seed.vehicleA.id })).status).toBe(404);

    // Un cliente no entra a las rutas de taller ni de administración
    for (const [method, path] of [["GET", "/api/mechanic/agenda"], ["GET", "/api/workers"], ["PATCH", `/api/mechanic/appointments/${id}/status`], ["POST", `/api/mechanic/appointments/${id}/report`], ["GET", "/api/admin/metrics"], ["GET", "/api/admin/users"], ["GET", "/api/admin/catalog"], ["GET", "/api/admin/export/appointments"], ["GET", "/api/email/preview/welcome"]] as const) {
      expect((await call(seed.clientB, method, path, method === "GET" ? undefined : {})).status).toBe(403);
    }
    // Un mecánico no entra a la administración
    for (const path of ["/api/admin/metrics", "/api/admin/users", "/api/admin/audit-logs", "/api/admin/catalog"]) {
      expect((await call(seed.mechanic, "GET", path)).status).toBe(403);
    }
    // Sin sesión, todo lo protegido responde 401
    for (const path of ["/api/appointments/my", "/api/vehicles", "/api/mechanic/agenda", "/api/admin/metrics", "/api/auth/me"]) {
      expect((await call(null, "GET", path)).status).toBe(401);
    }
    // El mecánico y el admin sí leen el informe; el dueño también
    expect((await call(seed.mechanic, "GET", `/api/appointments/${id}/report`)).status).toBe(200);
    expect((await call(seed.admin, "GET", `/api/appointments/${id}/report`)).status).toBe(200);
    expect((await call(seed.clientA, "GET", `/api/appointments/${id}/report`)).status).toBe(200);
  });
});
