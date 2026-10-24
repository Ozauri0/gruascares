import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db/connection.js";
import { testOutbox } from "../src/services/email/email.service.js";
import { ALLOWED_TRANSITIONS, canTransition } from "../src/domain/appointment-status.js";
import { cookieFor, dbReady, futureDate, resetDb, seedBasics, type Seed } from "./db.js";
import { startServer, type TestServer } from "./helpers.js";

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
});

async function createAppointment(status: string, over: { notes?: string; vehicleId?: string | null } = {}): Promise<string> {
  const [row] = await sql`insert into appointments (user_id, vehicle_id, service_id, scheduled_date, time_slot, status, notes)
    values (${seed.clientA.id}, ${over.vehicleId === undefined ? seed.vehicleA.id : over.vehicleId}, ${seed.serviceAceite.id}, ${futureDate()}, '10:30', ${status}, ${over.notes ?? null}) returning id`;
  return row.id as string;
}

const patchStatus = (id: string, user: { id: string; email: string; name: string; role: "admin" | "mecanico" | "usuario" | "vendedor" | "grua" }, body: unknown) =>
  fetch(`${server.url}/api/mechanic/appointments/${id}/status`, { method: "PATCH", headers: cookieFor(user), body: JSON.stringify(body) });
const postReport = (id: string, user: { id: string; email: string; name: string; role: "admin" | "mecanico" | "usuario" | "vendedor" | "grua" }, body: unknown) =>
  fetch(`${server.url}/api/mechanic/appointments/${id}/report`, { method: "POST", headers: cookieFor(user), body: JSON.stringify(body) });
const statusOf = async (id: string) => (await sql`select status from appointments where id = ${id}`)[0].status as string;

describe("BUG-4: tabla de transiciones", () => {
  test("flujo permitido y estados finales", () => {
    expect(canTransition("solicitada", "confirmada")).toBe(true);
    expect(canTransition("confirmada", "en_proceso")).toBe(true);
    expect(canTransition("en_proceso", "finalizada")).toBe(true);
    expect(canTransition("finalizada", "solicitada")).toBe(false);
    expect(canTransition("cancelada", "en_proceso")).toBe(false);
    expect(canTransition("en_proceso", "cancelada")).toBe(false);
    expect(ALLOWED_TRANSITIONS.finalizada).toHaveLength(0);
  });
});

describe.skipIf(!dbReady)("cambiar el mecánico a cargo desde el taller", () => {
  const assign = (id: string, user: Parameters<typeof patchStatus>[1], mechanicId: string) =>
    fetch(`${server.url}/api/mechanic/appointments/${id}/assign`, { method: "PATCH", headers: cookieFor(user), body: JSON.stringify({ mechanicId }) });

  test("un mecánico reasigna una cita solicitada o confirmada; no una finalizada ni a un cliente", async () => {
    const id = await createAppointment("solicitada");
    expect((await assign(id, seed.mechanic, seed.admin.id)).status).toBe(200);
    expect((await sql`select mechanic_id from appointments where id = ${id}`)[0].mechanic_id).toBe(seed.admin.id);

    expect((await assign(id, seed.mechanic, seed.clientA.id)).status).toBe(400); // un cliente no puede ser mecánico
    expect((await assign(id, seed.clientA, seed.mechanic.id)).status).toBe(403); // ni un cliente reasignar

    const done = await createAppointment("finalizada");
    expect((await assign(done, seed.mechanic, seed.mechanic.id)).status).toBe(409);
  });
});

describe.skipIf(!dbReady)("avisos al cliente al confirmar o cancelar", () => {
  test("confirmar una solicitud le envía el correo; avanzar a en_proceso no", async () => {
    const id = await createAppointment("solicitada");
    testOutbox.length = 0;
    expect((await patchStatus(id, seed.mechanic, { status: "confirmada" })).status).toBe(200);
    expect(testOutbox).toHaveLength(1);
    expect(testOutbox[0].to).toBe(seed.clientA.email);
    expect(testOutbox[0].subject).toContain("confirmada");
    expect(testOutbox[0].html).toContain("confirmó");

    expect((await patchStatus(id, seed.mechanic, { status: "en_proceso" })).status).toBe(200);
    expect(testOutbox).toHaveLength(1);
  });

  test("cancelar una solicitud también avisa", async () => {
    const id = await createAppointment("solicitada");
    testOutbox.length = 0;
    expect((await patchStatus(id, seed.mechanic, { status: "cancelada" })).status).toBe(200);
    expect(testOutbox[0]?.subject).toContain("cancelada");
  });
});

describe.skipIf(!dbReady)("BUG-4: cambios de estado", () => {
  test("avanza por el flujo válido y asigna al mecánico que inicia la atención", async () => {
    const id = await createAppointment("solicitada");
    expect((await patchStatus(id, seed.mechanic, { status: "confirmada" })).status).toBe(200);
    expect((await patchStatus(id, seed.mechanic, { status: "en_proceso" })).status).toBe(200);
    const [row] = await sql`select status, mechanic_id from appointments where id = ${id}`;
    expect(row.status).toBe("en_proceso");
    expect(row.mechanic_id).toBe(seed.mechanic.id);
  });

  test("rechaza saltos y retrocesos (409)", async () => {
    const id = await createAppointment("solicitada");
    expect((await patchStatus(id, seed.mechanic, { status: "finalizada" })).status).toBe(409);
    const done = await createAppointment("finalizada");
    expect((await patchStatus(done, seed.mechanic, { status: "solicitada" })).status).toBe(409);
    const cancelled = await createAppointment("cancelada");
    expect((await patchStatus(cancelled, seed.mechanic, { status: "en_proceso" })).status).toBe(409);
    expect(await statusOf(done)).toBe("finalizada");
  });

  test("no se puede finalizar sin informe técnico", async () => {
    const id = await createAppointment("en_proceso");
    expect((await patchStatus(id, seed.mechanic, { status: "finalizada" })).status).toBe(400);
  });

  test("mechanicId debe ser personal de taller activo", async () => {
    const id = await createAppointment("solicitada");
    const asClient = await patchStatus(id, seed.mechanic, { status: "confirmada", mechanicId: seed.clientB.id });
    expect(asClient.status).toBe(400);
    await sql`update users set is_active = false where id = ${seed.mechanic.id}`;
    const admin = await patchStatus(id, seed.admin, { status: "confirmada", mechanicId: seed.mechanic.id });
    expect(admin.status).toBe(400);
    expect((await patchStatus(id, seed.admin, { status: "confirmada", mechanicId: "no-uuid" })).status).toBe(400);
  });

  test("las notas del taller se agregan sin borrar las del cliente", async () => {
    const id = await createAppointment("solicitada", { notes: "Ruido al frenar" });
    await patchStatus(id, seed.mechanic, { status: "confirmada", notes: "Revisar discos" });
    const [row] = await sql`select notes from appointments where id = ${id}`;
    expect(row.notes).toContain("Ruido al frenar");
    expect(row.notes).toContain("[Taller] Revisar discos");
  });

  test("un cliente no puede cambiar estados desde la ruta de taller", async () => {
    const id = await createAppointment("solicitada");
    expect((await patchStatus(id, seed.clientA, { status: "confirmada" })).status).toBe(403);
  });

  test("ID inválido devuelve 400", async () => {
    expect((await patchStatus("no-uuid", seed.mechanic, { status: "confirmada" })).status).toBe(400);
  });
});

describe.skipIf(!dbReady)("BUG-4: informe técnico", () => {
  const report = { observations: "Cambio de aceite y filtro realizado", mileageAtService: 1500, partsReplaced: "Filtro", recommendations: "Revisar frenos" };

  test("no se puede informar una cita solicitada, confirmada o cancelada", async () => {
    for (const status of ["solicitada", "confirmada", "cancelada"]) {
      const id = await createAppointment(status);
      expect((await postReport(id, seed.mechanic, report)).status).toBe(409);
    }
  });

  test("informe en cita en taller la finaliza y sube el kilometraje", async () => {
    const id = await createAppointment("en_proceso");
    const res = await postReport(id, seed.mechanic, report);
    expect(res.status).toBe(201);
    const data = (await res.json()) as any;
    expect(data.finalized).toBe(true);
    expect(await statusOf(id)).toBe("finalizada");
    const [veh] = await sql`select mileage from vehicles where id = ${seed.vehicleA.id}`;
    expect(veh.mileage).toBe(1500);
  });

  test("el kilometraje no puede ser menor al registrado y no baja el odómetro", async () => {
    const id = await createAppointment("en_proceso");
    const low = await postReport(id, seed.mechanic, { ...report, mileageAtService: 500 });
    expect(low.status).toBe(400);
    const [veh] = await sql`select mileage from vehicles where id = ${seed.vehicleA.id}`;
    expect(veh.mileage).toBe(1000);
  });

  test("finalize=false guarda borrador sin finalizar; luego se finaliza con el informe existente", async () => {
    const id = await createAppointment("en_proceso");
    const draft = await postReport(id, seed.mechanic, { ...report, finalize: false });
    expect(draft.status).toBe(201);
    expect(((await draft.json()) as any).finalized).toBe(false);
    expect(await statusOf(id)).toBe("en_proceso");
    expect((await patchStatus(id, seed.mechanic, { status: "finalizada" })).status).toBe(200);
    expect(await statusOf(id)).toBe("finalizada");
  });

  test("corregir un informe ya finalizado no vuelve a finalizar ni cambia el estado", async () => {
    const id = await createAppointment("en_proceso");
    await postReport(id, seed.mechanic, report);
    const again = await postReport(id, seed.mechanic, { ...report, observations: "Observación corregida del trabajo" });
    expect(again.status).toBe(200);
    expect(((await again.json()) as any).finalized).toBe(false);
    const [rec] = await sql`select observations from service_records where appointment_id = ${id}`;
    expect(rec.observations).toBe("Observación corregida del trabajo");
  });
});

describe.skipIf(!dbReady)("BUG-4: cancelación", () => {
  const cancel = (id: string, user: { id: string; email: string; name: string; role: "admin" | "mecanico" | "usuario" | "vendedor" | "grua" }) =>
    fetch(`${server.url}/api/appointments/${id}/cancel`, { method: "PATCH", headers: cookieFor(user) });

  test("el cliente cancela su cita solicitada o confirmada", async () => {
    for (const status of ["solicitada", "confirmada"]) {
      const id = await createAppointment(status);
      expect((await cancel(id, seed.clientA)).status).toBe(200);
      expect(await statusOf(id)).toBe("cancelada");
    }
  });

  test("no se cancela una cita en taller, finalizada o ya cancelada", async () => {
    const inShop = await createAppointment("en_proceso");
    expect((await cancel(inShop, seed.clientA)).status).toBe(409);
    const done = await createAppointment("finalizada");
    expect((await cancel(done, seed.clientA)).status).toBe(400);
    const already = await createAppointment("cancelada");
    expect((await cancel(already, seed.clientA)).status).toBe(409);
  });

  test("otro cliente no puede cancelar la cita ajena", async () => {
    const id = await createAppointment("solicitada");
    expect((await cancel(id, seed.clientB)).status).toBe(403);
  });

  test("ID inválido devuelve 400 en detalle y cancelación", async () => {
    expect((await cancel("no-uuid", seed.clientA)).status).toBe(400);
    const res = await fetch(`${server.url}/api/appointments/no-uuid`, { headers: cookieFor(seed.clientA) });
    expect(res.status).toBe(400);
  });
});

describe.skipIf(!dbReady)("INT-8: agenda del mecánico", () => {
  const agenda = async (user: { id: string; email: string; name: string; role: "admin" | "mecanico" | "usuario" | "vendedor" | "grua" }, query = "") => {
    const res = await fetch(`${server.url}/api/mechanic/agenda${query}`, { headers: cookieFor(user) });
    return { status: res.status, body: (await res.json()) as any };
  };

  test("incluye el mecánico asignado (id y nombre) y report null sin informe", async () => {
    const withMechanic = await createAppointment("confirmada");
    await sql`update appointments set mechanic_id = ${seed.mechanic.id} where id = ${withMechanic}`;
    const unassigned = await createAppointment("solicitada");

    const { status, body } = await agenda(seed.mechanic, `?date=${futureDate()}`);
    expect(status).toBe(200);
    const a = body.agenda.find((i: any) => i.id === withMechanic);
    const b = body.agenda.find((i: any) => i.id === unassigned);
    expect(a.mechanicId).toBe(seed.mechanic.id);
    expect(a.mechanicName).toBe("Mecanico Test");
    expect(a.report).toBeNull();
    expect(b.mechanicId).toBeNull();
    expect(b.mechanicName).toBeNull();
  });

  test("un cliente no accede a la agenda del taller", async () => {
    expect((await agenda(seed.clientA)).status).toBe(403);
  });

  test("el flujo completo desde la agenda: confirmar, iniciar, informar y finalizar", async () => {
    const id = await createAppointment("solicitada");
    expect((await patchStatus(id, seed.mechanic, { status: "confirmada" })).status).toBe(200);
    expect((await patchStatus(id, seed.mechanic, { status: "en_proceso" })).status).toBe(200);
    const res = await postReport(id, seed.mechanic, { observations: "Trabajo terminado sin novedades", mileageAtService: 1200, finalize: true });
    expect(res.status).toBe(201);
    const { body } = await agenda(seed.mechanic, `?date=${futureDate()}`);
    const item = body.agenda.find((i: any) => i.id === id);
    expect(item.status).toBe("finalizada");
    expect(item.mechanicName).toBe("Mecanico Test");
    expect(item.report.observations).toBe("Trabajo terminado sin novedades");
  });
});
