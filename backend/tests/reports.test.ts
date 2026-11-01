import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { strFromU8, unzipSync } from "fflate";
import { sql } from "../src/db/connection.js";
import { buildXlsx, columnName, sheetName } from "../src/utils/xlsx.js";
import { cookieFor, dbReady, futureDate, resetDb, seedBasics, type Seed } from "./db.js";
import { startServer, type TestServer } from "./helpers.js";

/** Lee un .xlsx: devuelve, por hoja, las filas como texto/números (suficiente para comprobar el contenido). */
function readXlsx(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  const workbook = strFromU8(files["xl/workbook.xml"]);
  const names = [...workbook.matchAll(/<sheet name="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  const sheets: Record<string, (string | number | null)[][]> = {};
  names.forEach((name, i) => {
    const xml = strFromU8(files[`xl/worksheets/sheet${i + 1}.xml`]);
    sheets[name] = [...xml.matchAll(/<row r="\d+"[^>]*>(.*?)<\/row>/g)].map((row) =>
      [...row[1].matchAll(/<c r="([A-Z]+)\d+"[^>]*?(?:t="inlineStr")?[^>]*>(.*?)<\/c>/g)].reduce<(string | number | null)[]>((acc, cell) => {
        const col = cell[1].split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
        const text = /<t[^>]*>(.*?)<\/t>/.exec(cell[2]);
        const num = /<v>(.*?)<\/v>/.exec(cell[2]);
        acc[col] = text ? text[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&") : num ? Number(num[1]) : null;
        return acc;
      }, [])
    );
  });
  return { names, sheets, files };
}

describe("generador de Excel (.xlsx)", () => {
  test("letras de columna y nombres de hoja válidos", () => {
    expect([0, 25, 26, 27, 701, 702].map(columnName)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
    expect(sheetName("Resumen: [Mecánico]/2026?")).toBe("Resumen   Mecánico  2026");
    expect(sheetName("x".repeat(50))).toHaveLength(31);
  });

  test("produce un libro con varias hojas, encabezados, números y textos escapados", () => {
    const bytes = buildXlsx([
      { name: "Uno", columns: [{ header: "Nombre" }, { header: "Cantidad" }, { header: "Promedio", format: "decimal" }], rows: [["Ana & <Luis>", 3, 1.5], [null, 0, null], ["", 2, 2]] },
      { name: "Dos", columns: [{ header: "Solo" }], rows: [] },
    ]);
    const { names, sheets, files } = readXlsx(bytes);
    expect(names).toEqual(["Uno", "Dos"]);
    expect(Object.keys(files)).toContain("xl/styles.xml");
    expect(sheets.Uno[0]).toEqual(["Nombre", "Cantidad", "Promedio"]);
    expect(sheets.Uno[1]).toEqual(["Ana & <Luis>", 3, 1.5]);
    expect(sheets.Uno[2][1]).toBe(0);
    expect(strFromU8(files["xl/worksheets/sheet1.xml"])).toContain('<autoFilter ref="A1:C4"/>');
  });

  test("un texto que parece fórmula se guarda como texto, y se quitan los caracteres de control", () => {
    const { sheets, files } = readXlsx(buildXlsx([{ name: "F", columns: [{ header: "x" }], rows: [["=HYPERLINK(\"http://malo\")"], ["+cmd|' /C calc'!A0"], ["a\u0000b\u0007c"]] }]));
    const xml = strFromU8(files["xl/worksheets/sheet1.xml"]);
    expect(xml).not.toContain("<f>");
    expect(xml.match(/t="inlineStr"/g)?.length).toBe(4); // encabezado + 3 filas, todos como texto
    expect(sheets.F[1][0]).toBe('=HYPERLINK("http://malo")');
    expect(sheets.F[3][0]).toBe("abc");
  });

  test("sin hojas es un error", () => {
    expect(() => buildXlsx([])).toThrow();
  });
});

describe.skipIf(!dbReady)("reportes Excel de taller y grúas (#131)", () => {
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
  });

  type U = Seed["admin"];
  const get = (user: U | null, path: string) => fetch(`${server.url}${path}`, { headers: user ? cookieFor(user) : {} });
  const insert = async (serviceId: string, status: string, workerId: string | null, date = futureDate(), slot = "10:30") => {
    const [row] = await sql`insert into appointments (user_id, vehicle_id, service_id, scheduled_date, time_slot, status, worker_id, managed_by)
      values (${seed.clientA.id}, ${seed.vehicleA.id}, ${serviceId}, ${date}, ${slot}, ${status}, ${workerId}, ${workerId ? seed.mechanic.id : null}) returning id`;
    return row.id as string;
  };

  test("solo el admin descarga reportes", async () => {
    for (const user of [null, seed.clientA, seed.mechanic, seed.crane, seed.seller]) {
      expect((await get(user, "/api/admin/reports/taller")).status).toBe(user ? 403 : 401);
    }
    expect((await get(seed.admin, "/api/admin/reports/otra")).status).toBe(404);
    expect((await get(seed.admin, "/api/admin/reports/taller?startDate=2026-13-40")).status).toBe(400);
    expect((await get(seed.admin, "/api/admin/reports/taller?endDate=hoy")).status).toBe(400);
    expect((await get(seed.admin, "/api/admin/reports/taller?startDate=2026-12-31&endDate=2026-01-01")).status).toBe(400);
    expect((await get(seed.admin, "/api/admin/reports/taller?status=rara")).status).toBe(400);
  });

  test("el reporte de taller trae quién pidió, quién se encargó y el informe, solo de serviteca", async () => {
    const done = await insert(seed.serviceAceite.id, "finalizada", seed.mech.id, futureDate(3));
    await sql`insert into service_records (appointment_id, worker_id, authored_by, observations, parts_replaced, mileage_at_service, recommendations)
      values (${done}, ${seed.mech.id}, ${seed.mechanic.id}, 'Cambio de aceite y filtro', 'Filtro de aceite', 1800, 'Revisar frenos')`;
    await insert(seed.serviceAceite.id, "solicitada", null, futureDate(4), "09:30");
    await insert(seed.serviceAceite.id, "cancelada", seed.both.id, futureDate(5), "11:30");
    await insert(seed.serviceGrua.id, "confirmada", seed.rigger.id, futureDate(3), "12:30"); // grúa: no aparece en taller

    const res = await get(seed.admin, "/api/admin/reports/taller");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml.sheet");
    expect(res.headers.get("content-disposition")).toContain("reporte-taller-todo.xlsx");
    const { names, sheets } = readXlsx(new Uint8Array(await res.arrayBuffer()));
    expect(names).toEqual(["Resumen por mecánico", "Servicios taller"]);

    const rows = sheets["Servicios taller"];
    expect(rows).toHaveLength(4); // encabezado + 3 servicios de taller
    const header = rows[0] as string[];
    const col = (name: string) => header.indexOf(name);
    expect(col("Cliente (quién pidió)")).toBeGreaterThan(-1);
    const finished = rows.find((r) => r[col("Estado")] === "Finalizada")!;
    expect(finished[col("Cliente (quién pidió)")]).toBe("Cliente A");
    expect(finished[col("Mecánico a cargo")]).toBe("Pedro Taller");
    expect(finished[col("Jefe de área que gestionó")]).toBe("Mecanico Test");
    expect(finished[col("Observaciones técnicas")]).toBe("Cambio de aceite y filtro");
    expect(finished[col("Kilometraje en servicio")]).toBe(1800);
    expect(finished[col("Informe redactado por")]).toBe("Mecanico Test");
    expect(finished[col("Patente")]).toBe("ABCD12");
    expect(String(finished[col("RUT cliente")])).toMatch(/^\d{1,2}\.\d{3}\.\d{3}-[\dK]$/);
    expect(rows.find((r) => r[col("Estado")] === "Solicitada")![col("Mecánico a cargo")]).toBe("Sin asignar");
    expect(rows.some((r) => r[col("Servicio")] === "Grúa Test")).toBe(false);

    const summary = sheets["Resumen por mecánico"];
    const byName = Object.fromEntries(summary.slice(1).map((r) => [r[0], r]));
    expect(summary[0].slice(0, 5)).toEqual(["Mecánico", "RUT", "Tipo", "Estado", "Servicios"]);
    expect(byName["Pedro Taller"].slice(4, 10)).toEqual([1, 0, 0, 0, 1, 0]);
    expect(byName["Camilo Mixto"][9]).toBe(1); // una cancelada
    expect(byName["Sin trabajador asignado"][4]).toBe(1);
    expect(byName["TOTAL"].slice(4, 10)).toEqual([3, 1, 0, 0, 1, 1]);
    expect(byName["Pedro Taller"][10]).toBe(100); // 1 finalizada de 1 no cancelada
  });

  test("el reporte de grúas muestra solo grúas, con sus grueros", async () => {
    await insert(seed.serviceGrua.id, "finalizada", seed.rigger.id, futureDate(2));
    await insert(seed.serviceAceite.id, "confirmada", seed.mech.id, futureDate(2), "09:30");
    const { names, sheets } = readXlsx(new Uint8Array(await (await get(seed.admin, "/api/admin/reports/grua")).arrayBuffer()));
    expect(names).toEqual(["Resumen por gruero", "Servicios grúas"]);
    expect(sheets["Servicios grúas"]).toHaveLength(2);
    expect(sheets["Servicios grúas"][1].includes("Jorge Gruero")).toBe(true);
    expect(sheets["Resumen por gruero"].map((r) => r[0])).toContain("Jorge Gruero");
    expect(sheets["Resumen por gruero"].map((r) => r[0])).not.toContain("Pedro Taller");
  });

  test("filtra por fechas y estado, y el reporte vacío sigue siendo un Excel válido", async () => {
    const early = futureDate(2);
    const late = futureDate(40);
    await insert(seed.serviceAceite.id, "confirmada", seed.mech.id, early);
    await insert(seed.serviceAceite.id, "solicitada", null, late, "09:30");

    const ranged = await get(seed.admin, `/api/admin/reports/taller?startDate=${late}&endDate=${late}`);
    expect(ranged.headers.get("content-disposition")).toContain(`reporte-taller-${late}_a_${late}.xlsx`);
    expect(readXlsx(new Uint8Array(await ranged.arrayBuffer())).sheets["Servicios taller"]).toHaveLength(2);

    const byStatus = await get(seed.admin, "/api/admin/reports/taller?status=confirmada");
    expect(readXlsx(new Uint8Array(await byStatus.arrayBuffer())).sheets["Servicios taller"]).toHaveLength(2);

    const empty = await get(seed.admin, `/api/admin/reports/grua?startDate=${early}&endDate=${early}`);
    const { sheets } = readXlsx(new Uint8Array(await empty.arrayBuffer()));
    expect(sheets["Servicios grúas"]).toHaveLength(1); // solo el encabezado
    expect(sheets["Resumen por gruero"].map((r) => r[0])).toEqual(["Gruero", "TOTAL"]);
  });

  test("cada descarga queda en el registro de actividad", async () => {
    await get(seed.admin, "/api/admin/reports/grua");
    for (let i = 0; i < 40; i++) {
      const rows = await sql`select details from audit_logs where action = 'DATA_EXPORT_REPORT'`;
      if (rows.length) {
        expect(JSON.parse(rows[0].details as string)).toMatchObject({ area: "grua", count: 0 });
        return;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error("falta el evento DATA_EXPORT_REPORT");
  });
});
