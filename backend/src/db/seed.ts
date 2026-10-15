import { eq, inArray } from "drizzle-orm";
import { db, sql } from "./connection.js";
import { users, services, vehicles, appointments, serviceRecords } from "./schema.js";
import { hashPassword } from "../utils/password.js";
import { todayInSantiago } from "../utils/dates.js";
import { DEMO_ACCOUNTS, DEMO_EMAIL_DOMAIN } from "../config/demo.js";

/** Suma días a una fecha YYYY-MM-DD (aritmética de calendario, sin zonas horarias). */
function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const BASE_SERVICES = [
  // Grúas
  { category: "grua" as const, name: "Grúa de plataforma hidráulica", description: "Servicio de grúa para el traslado seguro de vehículos livianos y medianos. Atención de emergencias 24/7 en Villarrica y la IX Región.", basePrice: 45000, estimatedDurationMin: 60 },
  { category: "grua" as const, name: "Transporte de cargas pesadas", description: "Soluciones de transporte seguras, eficientes y adaptadas a maquinaria, carga industrial y estructuras.", basePrice: 90000, estimatedDurationMin: 120 },
  { category: "grua" as const, name: "Camiones grúa", description: "Servicio de camión pluma y grúa con operador calificado para faenas y montajes.", basePrice: 80000, estimatedDurationMin: 90 },
  { category: "grua" as const, name: "Rescate vehicular de emergencia", description: "Asistencia rápida en ruta por pana, colisión o rescate en zanja o terreno difícil.", basePrice: 50000, estimatedDurationMin: 60 },
  // Serviteca
  { category: "serviteca" as const, name: "Cambio de aceite y filtro", description: "Lubricación para motor con aceites de alto rendimiento y sustitución de filtro.", basePrice: 35000, estimatedDurationMin: 45 },
  { category: "serviteca" as const, name: "Cambio y balanceo de neumáticos", description: "Montaje, desmontaje y balanceo de neumáticos para autos, camionetas y camiones.", basePrice: 25000, estimatedDurationMin: 60 },
  { category: "serviteca" as const, name: "Mantenimiento general preventivo", description: "Inspección completa de niveles, correas, suspensión, fluidos y sistema eléctrico.", basePrice: 65000, estimatedDurationMin: 120 },
  { category: "serviteca" as const, name: "Revisión y cambio de pastillas de freno", description: "Diagnóstico del sistema de frenado, cambio de pastillas y rectificación si aplica.", basePrice: 40000, estimatedDurationMin: 90 },
];

async function seed() {
  // Crea cuentas con contraseñas conocidas: jamás en producción.
  if ((process.env.NODE_ENV || "production") === "production") {
    console.error("❌ db:seed está bloqueado en producción (crea usuarios con contraseñas conocidas). Define NODE_ENV=development solo en entornos locales.");
    process.exit(1);
  }

  console.log("🌱 Iniciando seed de la base de datos de Grúas Cares (idempotente)...");

  // 1. Usuarios demo (dominio reservado .test)
  console.log("-> Usuarios demo...");
  const demoUsers = [
    { name: "Administrador Demo", email: DEMO_ACCOUNTS.admin, role: "admin" as const, phone: "+56 9 9162 7809", password: "admin1234" },
    { name: "Juan Paredes (Mecánico Demo)", email: DEMO_ACCOUNTS.mecanico, role: "mecanico" as const, phone: "+56 9 6832 7329", password: "mecanico1234" },
    { name: "Diego Fuentes (Mecánico Demo)", email: `mecanico2${DEMO_EMAIL_DOMAIN}`, role: "mecanico" as const, phone: "+56 9 6857 4677", password: "mecanico1234" },
    { name: "María González (Cliente Demo)", email: DEMO_ACCOUNTS.usuario, role: "usuario" as const, phone: "+56 9 1234 5678", password: "cliente1234" },
    { name: "Pedro Soto (Cliente Demo)", email: `cliente2${DEMO_EMAIL_DOMAIN}`, role: "usuario" as const, phone: "+56 9 8765 4321", password: "cliente1234" },
  ];
  for (const u of demoUsers) {
    const { password, ...values } = u;
    await db.insert(users).values({ ...values, passwordHash: await hashPassword(password) }).onConflictDoNothing({ target: users.email });
  }
  const byEmail = Object.fromEntries(
    (await db.select().from(users).where(inArray(users.email, demoUsers.map((u) => u.email)))).map((u) => [u.email, u])
  );
  const mecanico1 = byEmail[DEMO_ACCOUNTS.mecanico];
  const mecanico2 = byEmail[`mecanico2${DEMO_EMAIL_DOMAIN}`];
  const cliente1 = byEmail[DEMO_ACCOUNTS.usuario];
  const cliente2 = byEmail[`cliente2${DEMO_EMAIL_DOMAIN}`];

  // 2. Catálogo de servicios (solo los que faltan)
  console.log("-> Catálogo de servicios...");
  const existingNames = new Set((await db.select({ name: services.name }).from(services)).map((s) => s.name));
  const missing = BASE_SERVICES.filter((s) => !existingNames.has(s.name));
  if (missing.length > 0) await db.insert(services).values(missing);
  const serviceByName = Object.fromEntries((await db.select().from(services)).map((s) => [s.name, s]));

  // 3. Vehículos de los clientes demo
  console.log("-> Vehículos demo...");
  await db
    .insert(vehicles)
    .values([
      { userId: cliente1.id, plate: "ABCD12", brand: "Toyota", model: "Hilux", year: 2021, mileage: 84500, notes: "Uso mixto en faena y ciudad" },
      { userId: cliente1.id, plate: "EFGH34", brand: "Hyundai", model: "Accent", year: 2019, mileage: 112300 },
      { userId: cliente2.id, plate: "JKLM56", brand: "Nissan", model: "Navara", year: 2020, mileage: 67000 },
    ])
    .onConflictDoNothing();
  const vehicleByPlate = Object.fromEntries((await db.select().from(vehicles)).map((v) => [v.plate, v]));

  // 4. Citas e informe técnico (solo si aún no hay citas demo)
  const hasAppointments = (await db.select({ id: appointments.id }).from(appointments).where(eq(appointments.userId, cliente1.id)).limit(1)).length > 0;
  if (!hasAppointments) {
    console.log("-> Citas e informes demo...");
    const today = todayInSantiago();
    const aceite = serviceByName["Cambio de aceite y filtro"];
    const mantencion = serviceByName["Mantenimiento general preventivo"];
    const grua = serviceByName["Grúa de plataforma hidráulica"];
    const frenos = serviceByName["Revisión y cambio de pastillas de freno"];

    const [pasada] = await db
      .insert(appointments)
      .values({ userId: cliente1.id, vehicleId: vehicleByPlate["ABCD12"].id, serviceId: frenos.id, mechanicId: mecanico1.id, scheduledDate: addDays(today, -30), timeSlot: "10:30", status: "finalizada", location: "Taller Villarrica" })
      .returning();
    await db.insert(serviceRecords).values({
      appointmentId: pasada.id,
      mechanicId: mecanico1.id,
      observations: "Se reemplazaron pastillas delanteras y se rectificaron discos. Nivel de líquido de frenos correcto.",
      partsReplaced: "Pastillas de freno delanteras (juego), líquido de frenos DOT4.",
      mileageAtService: 84210,
      recommendations: "Revisar pastillas traseras en la próxima mantención.",
    });

    await db.insert(appointments).values([
      { userId: cliente1.id, vehicleId: vehicleByPlate["ABCD12"].id, serviceId: mantencion.id, scheduledDate: addDays(today, 1), timeSlot: "09:30", status: "confirmada", mechanicId: mecanico1.id, location: "Taller Villarrica", notes: "Revisar frenos traseros." },
      { userId: cliente1.id, vehicleId: vehicleByPlate["EFGH34"].id, serviceId: grua.id, scheduledDate: addDays(today, 3), timeSlot: "15:00", status: "solicitada", location: "Ruta Villarrica – Pucón km 8" },
      { userId: cliente2.id, vehicleId: vehicleByPlate["JKLM56"].id, serviceId: aceite.id, scheduledDate: addDays(today, 1), timeSlot: "10:30", status: "solicitada" },
      { userId: cliente2.id, vehicleId: vehicleByPlate["JKLM56"].id, serviceId: mantencion.id, scheduledDate: addDays(today, 2), timeSlot: "11:30", status: "confirmada", mechanicId: mecanico2.id },
    ]);
  }

  console.log("✅ Seed completado. Cuentas demo (solo desarrollo):");
  console.log(`   - Admin:    ${DEMO_ACCOUNTS.admin} (clave: admin1234)`);
  console.log(`   - Mecánico: ${DEMO_ACCOUNTS.mecanico} (clave: mecanico1234)`);
  console.log(`   - Cliente:  ${DEMO_ACCOUNTS.usuario} (clave: cliente1234)`);

  await sql.end();
}

seed().catch((err) => {
  console.error("❌ Error ejecutando seed:", err);
  process.exit(1);
});
