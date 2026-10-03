import bcrypt from "bcryptjs";
import { db, sql } from "./connection.js";
import { users, services, vehicles, appointments, serviceRecords } from "./schema.js";

async function seed() {
  console.log("🌱 Iniciando seed de la base de datos de Grúas Cares...");

  // 1. Password Hashes
  const adminPassword = await bcrypt.hash("admin1234", 10);
  const mechanicPassword = await bcrypt.hash("mecanico1234", 10);
  const clientPassword = await bcrypt.hash("cliente1234", 10);

  // 2. Usuarios Iniciales
  console.log("-> Creando usuarios iniciales...");
  const [adminUser] = await db
    .insert(users)
    .values({
      name: "Administrador Grúas Cares",
      email: "admin@gruascares.cl",
      passwordHash: adminPassword,
      role: "admin",
      phone: "+56 9 9162 7809",
    })
    .onConflictDoNothing({ target: users.email })
    .returning();

  const [mechanicUser] = await db
    .insert(users)
    .values({
      name: "Carlos Mecánico",
      email: "mecanico@gruascares.cl",
      passwordHash: mechanicPassword,
      role: "mecanico",
      phone: "+56 9 6832 7329",
    })
    .onConflictDoNothing({ target: users.email })
    .returning();

  const [demoClient] = await db
    .insert(users)
    .values({
      name: "Juan Pérez (Cliente Demo)",
      email: "cliente@empresa.cl",
      passwordHash: clientPassword,
      role: "usuario",
      phone: "+56 9 1234 5678",
    })
    .onConflictDoNothing({ target: users.email })
    .returning();

  // 3. Catálogo de Servicios
  console.log("-> Creando catálogo de servicios (Grúas y Serviteca)...");
  const baseServices = [
    // Grúas
    {
      category: "grua" as const,
      name: "Grúa de plataforma hidráulica",
      description: "Servicio de grúa para el traslado seguro de vehículos livianos y medianos. Atención de emergencias 24/7 en Villarrica y la IX Región.",
      basePrice: 45000,
      estimatedDurationMin: 60,
    },
    {
      category: "grua" as const,
      name: "Transporte de cargas pesadas",
      description: "Soluciones de transporte seguras, eficientes y adaptadas a maquinaria, carga industrial y estructuras.",
      basePrice: 90000,
      estimatedDurationMin: 120,
    },
    {
      category: "grua" as const,
      name: "Camiones grúa",
      description: "Servicio de camión pluma y grúa con operador calificado para faenas y montajes.",
      basePrice: 80000,
      estimatedDurationMin: 90,
    },
    {
      category: "grua" as const,
      name: "Rescate vehicular de emergencia",
      description: "Asistencia rápida en ruta por pana, colisión o rescate en zanja o terreno difícil.",
      basePrice: 50000,
      estimatedDurationMin: 60,
    },
    // Serviteca
    {
      category: "serviteca" as const,
      name: "Cambio de aceite y filtro",
      description: "Lubricación para motor con aceites de alto rendimiento y sustitución de filtro.",
      basePrice: 35000,
      estimatedDurationMin: 45,
    },
    {
      category: "serviteca" as const,
      name: "Cambio y balanceo de neumáticos",
      description: "Montaje, desmontaje y balanceo de neumáticos para autos, camionetas y camiones.",
      basePrice: 25000,
      estimatedDurationMin: 60,
    },
    {
      category: "serviteca" as const,
      name: "Mantenimiento general preventivo",
      description: "Inspección completa de niveles, correas, suspensión, fluidos y sistema eléctrico.",
      basePrice: 65000,
      estimatedDurationMin: 120,
    },
    {
      category: "serviteca" as const,
      name: "Revisión y cambio de pastillas de freno",
      description: "Diagnóstico del sistema de frenado, cambio de pastillas y rectificación si aplica.",
      basePrice: 40000,
      estimatedDurationMin: 90,
    },
  ];

  for (const s of baseServices) {
    await db.insert(services).values(s).onConflictDoNothing();
  }

  // 4. Vehículo de ejemplo (si existe el cliente demo)
  if (demoClient) {
    console.log("-> Creando vehículo de prueba para cliente demo...");
    const [demoVehicle] = await db
      .insert(vehicles)
      .values({
        userId: demoClient.id,
        plate: "ABCD-12",
        brand: "Toyota",
        model: "Hilux 4x4",
        year: 2022,
        mileage: 65000,
        notes: "Uso mixto en faena y ciudad",
      })
      .returning();

    // 5. Cita y Bitácora de prueba
    if (demoVehicle && mechanicUser) {
      console.log("-> Creando cita y registro técnico de prueba...");
      const serviceList = await db.select().from(services).limit(1);
      if (serviceList.length > 0) {
        const [demoAppt] = await db
          .insert(appointments)
          .values({
            userId: demoClient.id,
            vehicleId: demoVehicle.id,
            serviceId: serviceList[0].id,
            mechanicId: mechanicUser.id,
            scheduledDate: new Date().toISOString().slice(0, 10),
            timeSlot: "10:30",
            status: "finalizada",
            notes: "Cambio de aceite periódico",
          })
          .returning();

        if (demoAppt) {
          await db.insert(serviceRecords).values({
            appointmentId: demoAppt.id,
            mechanicId: mechanicUser.id,
            observations: "Cambio de aceite de motor 10W-40 y filtro de aceite original. Se revisaron niveles generales.",
            partsReplaced: "Filtro de aceite OEM Toyota, 6L Aceite Sintético 10W40",
            mileageAtService: 65000,
            recommendations: "Revisar pastillas de freno delanteras en 5.000 km.",
          });
        }
      }
    }
  }

  console.log("✅ Seed completado con éxito:");
  console.log("   - Admin:    admin@gruascares.cl (pass: admin1234)");
  console.log("   - Mecánico: mecanico@gruascares.cl (pass: mecanico1234)");
  console.log("   - Cliente:  cliente@empresa.cl (pass: cliente1234)");

  await sql.end();
}

seed().catch((err) => {
  console.error("❌ Error ejecutando seed:", err);
  process.exit(1);
});
