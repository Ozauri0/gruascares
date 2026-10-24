import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db/connection.js";
import { testOutbox } from "../src/services/email/email.service.js";
import { computeRutDv, formatRut, isValidRut, makeValidRut, normalizeRut } from "../src/utils/rut.js";
import { cookieFor, dbReady, futureDate, resetDb, seedBasics, type Seed } from "./db.js";
import { startServer, type TestServer } from "./helpers.js";

describe("RUT chileno (Módulo 11)", () => {
  test("normaliza sin puntos, con guion y K mayúscula", () => {
    expect(normalizeRut("12.345.678-5")).toBe("12345678-5");
    expect(normalizeRut("11111111k")).toBe("11111111-K");
    expect(normalizeRut("  7.654.321 - 6 ")).toBe("7654321-6");
  });

  test("valida dígito verificador Módulo 11 (0-9 y K)", () => {
    expect(computeRutDv("12345678")).toBe("5");
    expect(isValidRut("12.345.678-5")).toBe(true);
    expect(isValidRut("12345678-5")).toBe(true);
    expect(isValidRut("12345678-0")).toBe(false);
    expect(isValidRut("11.111.111-1")).toBe(true);
    expect(isValidRut("11.111.111-K")).toBe(false);
    const rutK = "10000013-K";
    expect(computeRutDv("10000013")).toBe("K");
    expect(isValidRut(rutK)).toBe(true);
    expect(isValidRut("10.000.013-k")).toBe(true);
    expect(isValidRut("abc")).toBe(false);
    expect(isValidRut("123-4")).toBe(false);
    expect(isValidRut("")).toBe(false);
    expect(isValidRut(null)).toBe(false);
  });

  test("formatRut formatea con puntos y guion y makeValidRut genera RUTs válidos", () => {
    expect(formatRut("12345678-5")).toBe("12.345.678-5");
    for (let i = 1; i <= 20; i++) {
      expect(isValidRut(makeValidRut(i))).toBe(true);
    }
  });
});

describe.skipIf(!dbReady)("RUT en usuarios, reclamo de perfiles y atención presencial (#127)", () => {
  let server: TestServer;
  let seed: Seed;

  beforeAll(async () => {
    server = await startServer();
  });
  afterAll(async () => {
    await server.close();
  });
  beforeEach(async () => {
    await resetDb();
    seed = await seedBasics();
    testOutbox.length = 0;
  });

  type U = Seed["admin"];
  const call = async (user: U | null, method: string, path: string, body?: unknown) => {
    const headers = user ? cookieFor(user) : { "Content-Type": "application/json" };
    const res = await fetch(`${server.url}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, headers: res.headers, body: (await res.json().catch(() => ({}))) as any };
  };

  const tokenFromLastEmail = () =>
    decodeURIComponent(testOutbox.at(-1)!.html.match(/confirmar-correo\?token=([^"&\s<]+)/)![1]);

  test("registro web: rechaza RUT inválido, exige teléfono y rechaza RUT duplicado", async () => {
    const validRut = makeValidRut(901);

    // RUT con dígito verificador incorrecto
    const badRut = await call(null, "POST", "/api/auth/register", {
      name: "Juan Pérez",
      rut: "12.345.678-0",
      phone: "+56 9 8765 4321",
      email: "juan@test.cl",
      password: "password123",
    });
    expect(badRut.status).toBe(400);

    // Sin teléfono
    const noPhone = await call(null, "POST", "/api/auth/register", {
      name: "Juan Pérez",
      rut: validRut,
      email: "juan@test.cl",
      password: "password123",
    });
    expect(noPhone.status).toBe(400);

    // Registro válido con puntos (se guarda normalizado sin puntos y con guion)
    const ok = await call(null, "POST", "/api/auth/register", {
      name: "Juan Pérez",
      rut: formatRut(validRut),
      phone: "+56 9 8765 4321",
      email: "juan@test.cl",
      password: "password123",
    });
    expect(ok.status).toBe(201);
    expect(ok.body.user.rut).toBe(validRut);

    // Duplicado por RUT (cuenta que ya tiene contraseña)
    const dupRut = await call(null, "POST", "/api/auth/register", {
      name: "Impostor",
      rut: validRut,
      phone: "+56 9 0000 0000",
      email: "impostor@test.cl",
      password: "password123",
    });
    expect(dupRut.status).toBe(409);
  });

  test("ventas y admin crean perfil presencial sin correo ni contraseña; mecánico y cliente reciben 403", async () => {
    const rutVentas = makeValidRut(910);
    const rutAdmin = makeValidRut(911);

    // Mecánico y cliente reciben 403
    expect(
      (
        await call(seed.mechanic, "POST", "/api/clients", {
          name: "Don Mario",
          rut: rutVentas,
          phone: "+56 9 5555 1111",
        })
      ).status
    ).toBe(403);
    expect(
      (
        await call(seed.clientA, "POST", "/api/clients", {
          name: "Don Mario",
          rut: rutVentas,
          phone: "+56 9 5555 1111",
        })
      ).status
    ).toBe(403);

    // Vendedor crea perfil sin correo ni contraseña
    const bySeller = await call(seed.seller, "POST", "/api/clients", {
      name: "Don Mario",
      rut: formatRut(rutVentas),
      phone: "+56 9 5555 1111",
    });
    expect(bySeller.status).toBe(201);
    expect(bySeller.body.client).toMatchObject({
      rut: rutVentas,
      name: "Don Mario",
      phone: "+56 9 5555 1111",
      email: null,
      hasAccount: false,
    });

    // Admin crea perfil con correo opcional
    const byAdmin = await call(seed.admin, "POST", "/api/clients", {
      name: "Sra. Rosa",
      rut: rutAdmin,
      phone: "+56 9 5555 2222",
      email: "rosa@test.cl",
    });
    expect(byAdmin.status).toBe(201);
    expect(byAdmin.body.client).toMatchObject({
      rut: rutAdmin,
      email: "rosa@test.cl",
      hasAccount: false,
    });

    // Sin contraseña no puede iniciar sesión
    const loginAttempt = await call(null, "POST", "/api/auth/login", {
      email: "rosa@test.cl",
      password: "password123",
    });
    expect(loginAttempt.status).toBe(401);

    // Búsqueda por RUT disponible para ventas, mecánico y admin
    const lookup = await call(seed.mechanic, "GET", `/api/clients/by-rut?rut=${encodeURIComponent(formatRut(rutVentas))}`);
    expect(lookup.status).toBe(200);
    expect(lookup.body.client.id).toBe(bySeller.body.client.id);
    expect(lookup.body.client.hasAccount).toBe(false);
    expect((await call(seed.clientA, "GET", `/api/clients/by-rut?rut=${rutVentas}`)).status).toBe(403);
  });

  test("una cita creada por RUT para un cliente con cuenta aparece en su portal", async () => {
    const date = futureDate(5);
    const booked = await call(seed.mechanic, "POST", "/api/appointments", {
      rut: formatRut(seed.clientA.rut),
      serviceId: seed.serviceAceite.id,
      scheduledDate: date,
      timeSlot: "10:30",
      vehicleId: seed.vehicleA.id,
      notes: "Ingresado por taller con RUT",
    });
    expect(booked.status).toBe(201);
    expect(booked.body.appointment.userId).toBe(seed.clientA.id);

    const mine = await call(seed.clientA, "GET", "/api/appointments/my");
    expect(mine.status).toBe(200);
    expect(mine.body.appointments).toHaveLength(1);
    expect(mine.body.appointments[0]).toMatchObject({
      id: booked.body.appointment.id,
      scheduledDate: date,
      timeSlot: "10:30",
      notes: "Ingresado por taller con RUT",
    });
  });

  test("mecánico no puede crear un perfil nuevo al agendar por RUT desconocido (403); ventas sí puede", async () => {
    const unknownRut = makeValidRut(920);
    const date = futureDate(6);

    const byMechanic = await call(seed.mechanic, "POST", "/api/appointments", {
      rut: unknownRut,
      client: { name: "Cliente Nuevo", rut: unknownRut, phone: "+56 9 6666 7777" },
      serviceId: seed.serviceGrua.id,
      scheduledDate: date,
      timeSlot: "09:30",
    });
    expect(byMechanic.status).toBe(403);

    const bySeller = await call(seed.seller, "POST", "/api/appointments", {
      rut: unknownRut,
      client: { name: "Cliente Nuevo", rut: unknownRut, phone: "+56 9 6666 7777" },
      newVehicle: { plate: "KLMN34", brand: "Chevrolet", model: "D-Max", year: 2022, mileage: 15000 },
      serviceId: seed.serviceGrua.id,
      scheduledDate: date,
      timeSlot: "09:30",
    });
    expect(bySeller.status).toBe(201);
    // Sin correo no se envían avisos automáticos
    expect(testOutbox).toHaveLength(0);
  });

  test("reclamo de perfil presencial con historial: tras confirmar correo ve vehículos, citas e informes técnicos", async () => {
    const walkInRut = makeValidRut(930);
    const date = futureDate(4);

    // 1. Secretaría (vendedor) registra al cliente presencialmente, su vehículo y su cita
    const booked = await call(seed.seller, "POST", "/api/appointments", {
      rut: walkInRut,
      client: { name: "Don Pedro Presencial", rut: walkInRut, phone: "+56 9 4321 8765" },
      newVehicle: { plate: "PRST55", brand: "Nissan", model: "Navara", year: 2019, mileage: 82000 },
      serviceId: seed.serviceAceite.id,
      scheduledDate: date,
      timeSlot: "11:30",
      notes: "Revisión presencial",
    });
    expect(booked.status).toBe(201);
    const appointmentId = booked.body.appointment.id as string;
    const walkInUserId = booked.body.appointment.userId as string;

    // 2. El mecánico atiende la cita y guarda el informe técnico
    expect((await call(seed.mechanic, "PATCH", `/api/mechanic/appointments/${appointmentId}/status`, { status: "confirmada" })).status).toBe(200);
    expect((await call(seed.mechanic, "PATCH", `/api/mechanic/appointments/${appointmentId}/status`, { status: "en_proceso" })).status).toBe(200);
    expect(
      (
        await call(seed.mechanic, "POST", `/api/mechanic/appointments/${appointmentId}/report`, {
          observations: "Mantención completa realizada en taller",
          partsReplaced: "Filtro de aceite y aire",
          mileageAtService: 82500,
          recommendations: "Próximo cambio a los 92.500 km",
          finalize: true,
        })
      ).status
    ).toBe(201);

    const usersBefore = Number((await sql`select count(*)::int as n from users`)[0].n);

    // 3. El cliente se registra después en la web con el mismo RUT
    testOutbox.length = 0;
    const claim = await call(null, "POST", "/api/auth/register", {
      name: "Pedro Presencial",
      rut: formatRut(walkInRut),
      phone: "+56 9 4321 8765",
      email: "pedro@cliente.cl",
      password: "miClaveSegura123",
    });
    expect(claim.status).toBe(201);
    expect(claim.body.verificationRequired).toBe(true);
    expect(claim.body.user.id).toBe(walkInUserId); // mismo registro en users, no se crea otro
    expect(Number((await sql`select count(*)::int as n from users`)[0].n)).toBe(usersBefore);

    // 4. Seguridad del reclamo: antes de confirmar el correo NO puede iniciar sesión ni ver el historial
    const earlyLogin = await call(null, "POST", "/api/auth/login", {
      email: "pedro@cliente.cl",
      password: "miClaveSegura123",
    });
    expect(earlyLogin.status).toBe(403);
    expect(earlyLogin.body.error).toBe("EmailNotVerified");

    // 5. Tampoco se puede volver a reclamar el mismo RUT porque ya tiene contraseña
    const secondClaim = await call(null, "POST", "/api/auth/register", {
      name: "Otro",
      rut: walkInRut,
      phone: "+56 9 0000 0000",
      email: "otro@cliente.cl",
      password: "otraClave123",
    });
    expect(secondClaim.status).toBe(409);

    // 6. Confirma su correo e inicia sesión
    const token = tokenFromLastEmail();
    expect((await call(null, "POST", "/api/auth/verify-email", { token })).status).toBe(200);

    const loginRes = await call(null, "POST", "/api/auth/login", {
      email: "pedro@cliente.cl",
      password: "miClaveSegura123",
    });
    expect(loginRes.status).toBe(200);
    const sessionCookie = /gc_token=([^;]+)/.exec(loginRes.headers.get("set-cookie") ?? "")![1];
    const authHeaders = { Cookie: `gc_token=${sessionCookie}` };

    // 7. Ve de inmediato sus vehículos, citas anteriores e informes técnicos
    const vehRes = await fetch(`${server.url}/api/vehicles`, { headers: authHeaders });
    const vehBody = (await vehRes.json()) as any;
    expect(vehBody.vehicles).toHaveLength(1);
    expect(vehBody.vehicles[0]).toMatchObject({
      plate: "PRST55",
      brand: "Nissan",
      model: "Navara",
      mileage: 82500,
    });

    const myApptsRes = await fetch(`${server.url}/api/appointments/my`, { headers: authHeaders });
    const myApptsBody = (await myApptsRes.json()) as any;
    expect(myApptsBody.appointments).toHaveLength(1);
    expect(myApptsBody.appointments[0]).toMatchObject({
      id: appointmentId,
      status: "finalizada",
      report: {
        observations: "Mantención completa realizada en taller",
        partsReplaced: "Filtro de aceite y aire",
        mileageAtService: 82500,
      },
    });
  });

  test("auditoría: queda registrado quién creó al cliente presencial y quién creó la cita", async () => {
    const rut = makeValidRut(940);
    const res = await call(seed.seller, "POST", "/api/appointments", {
      rut,
      client: { name: "Cliente Auditado", rut, phone: "+56 9 9988 7766" },
      serviceId: seed.serviceAceite.id,
      scheduledDate: futureDate(7),
      timeSlot: "10:30",
    });
    expect(res.status).toBe(201);

    for (let i = 0; i < 40; i++) {
      const rows = await sql`select action, user_id, details from audit_logs where action in ('WALK_IN_CLIENT_CREATED', 'APPOINTMENT_CREATE_BY_STAFF') order by created_at`;
      if (rows.length >= 2) {
        const clientLog = rows.find((r) => r.action === "WALK_IN_CLIENT_CREATED")!;
        const apptLog = rows.find((r) => r.action === "APPOINTMENT_CREATE_BY_STAFF")!;
        expect(clientLog.user_id).toBe(seed.seller.id);
        expect(JSON.parse(clientLog.details as string)).toMatchObject({ rut, name: "Cliente Auditado" });
        expect(apptLog.user_id).toBe(seed.seller.id);
        expect(JSON.parse(apptLog.details as string)).toMatchObject({ clientRut: rut, clientName: "Cliente Auditado" });
        return;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error("faltan eventos de auditoría WALK_IN_CLIENT_CREATED / APPOINTMENT_CREATE_BY_STAFF");
  });

  test("un perfil presencial con correo mal anotado no se puede tomar con «olvidé mi contraseña»", async () => {
    const rut = makeValidRut(950);
    const created = await call(seed.seller, "POST", "/api/clients", {
      name: "Juan Pérez",
      rut,
      phone: "+56 9 5555 0000",
      email: "otra.persona@example.com",
    });
    expect(created.status).toBe(201);
    testOutbox.length = 0;

    const forgot = await call(null, "POST", "/api/auth/forgot-password", { email: "otra.persona@example.com" });
    expect(forgot.status).toBe(200); // misma respuesta que para cualquier correo: no revela nada
    expect(testOutbox).toHaveLength(0);
    const tokens = await sql`select count(*)::int as n from password_reset_tokens`;
    expect(tokens[0].n).toBe(0);

    // El perfil sigue sin contraseña y se puede reclamar con el RUT
    const claim = await call(null, "POST", "/api/auth/register", {
      name: "Juan Pérez",
      rut,
      email: "juan.perez@example.com",
      phone: "+56 9 5555 0000",
      password: "ClaveSegura123!",
    });
    expect(claim.status).toBe(201);
    expect(claim.body.claimed).toBe(true);
  });
});
