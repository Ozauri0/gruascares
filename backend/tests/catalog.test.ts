import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db/connection.js";
import { isAllowedImage } from "../src/controllers/catalog.controller.js";
import { cookieFor, dbReady, resetDb, seedBasics, type Seed } from "./db.js";
import { startServer, type TestServer } from "./helpers.js";

describe("INT-10: política de imágenes del catálogo", () => {
  test("acepta rutas locales y URLs https; rechaza el resto", () => {
    for (const ok of ["/images/service-grua.jpg", "/api/uploads/123e4567-e89b-12d3-a456-426614174000.webp", "https://cdn.example.com/a/b.png?v=1"]) expect(isAllowedImage(ok)).toBe(true);
    for (const bad of [
      "http://example.com/a.png",
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "//evil.example/a.png",
      "/images/../../etc/passwd",
      "/otra-carpeta/a.png",
      "https://example.com/a b.png",
      'https://example.com/"onerror=alert(1)',
      "",
      `https://example.com/${"a".repeat(500)}`,
      123,
      null,
    ]) {
      expect(isAllowedImage(bad)).toBe(false);
    }
  });
});

describe.skipIf(!dbReady)("INT-10: catálogo", () => {
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

  type U = { id: string; email: string; name: string; role: "admin" | "mecanico" | "usuario" | "vendedor" | "grua" };
  const admin = (user: U, method: string, path: string, body?: unknown) =>
    fetch(`${server.url}${path}`, { method, headers: cookieFor(user), body: body === undefined ? undefined : JSON.stringify(body) });
  const product = { name: "Neumático 295/80", description: "Para camión", price: 189990, stock: 8, category: "top ventas", art: "tyre", featured: true };

  test("lectura pública: solo activos, destacados primero, con caché corta", async () => {
    await admin(seed.admin, "POST", "/api/admin/catalog", { ...product, name: "Destacado", featured: true });
    await admin(seed.admin, "POST", "/api/admin/catalog", { ...product, name: "Normal", featured: false });
    await admin(seed.admin, "POST", "/api/admin/catalog", { ...product, name: "Oculto", featured: false, active: false });

    const res = await fetch(`${server.url}/api/catalog`); // sin sesión
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("max-age");
    const { products } = (await res.json()) as any;
    expect(products.map((p: any) => p.name)).toEqual(["Destacado", "Normal"]);
    expect(products[0].active).toBeUndefined(); // el público no ve el estado interno
    expect(products[0].category).toBe("TOP VENTAS");
  });

  test("admin ve también los inactivos", async () => {
    await admin(seed.admin, "POST", "/api/admin/catalog", { ...product, name: "Oculto", active: false });
    const { products } = (await (await admin(seed.admin, "GET", "/api/admin/catalog")).json()) as any;
    expect(products).toHaveLength(1);
    expect(products[0].active).toBe(false);
  });

  test("crea, edita y elimina con auditoría", async () => {
    const created = await admin(seed.admin, "POST", "/api/admin/catalog", product);
    expect(created.status).toBe(201);
    const { id } = ((await created.json()) as any).product;

    const patched = await admin(seed.admin, "PATCH", `/api/admin/catalog/${id}`, { price: 175000, stock: 3, image: "/images/service-grua.jpg", tag: " OFERTA " });
    expect(patched.status).toBe(200);
    const body = ((await patched.json()) as any).product;
    expect(body).toMatchObject({ price: 175000, stock: 3, image: "/images/service-grua.jpg", tag: "OFERTA" });

    expect((await admin(seed.admin, "PATCH", `/api/admin/catalog/${id}`, { image: null, tag: null })).status).toBe(200);
    expect((await admin(seed.admin, "DELETE", `/api/admin/catalog/${id}`)).status).toBe(200);
    expect((await admin(seed.admin, "DELETE", `/api/admin/catalog/${id}`)).status).toBe(404);

    for (let i = 0; i < 30; i++) {
      const rows = await sql`select action from audit_logs where action like 'CATALOG_%'`;
      if (rows.length >= 4) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error("faltan eventos de auditoría del catálogo");
  });

  test("valida precios, stock, arte, imagen y tipos", async () => {
    for (const bad of [
      { ...product, price: -1 },
      { ...product, price: 10.5 },
      { ...product, price: "100" },
      { ...product, stock: 2_000_000 },
      { ...product, art: "unicornio" },
      { ...product, name: "x" },
      { ...product, image: "data:image/png;base64,AAAA" },
      { ...product, image: "http://insegura.example/a.png" },
      { ...product, featured: "si" },
    ]) {
      expect((await admin(seed.admin, "POST", "/api/admin/catalog", bad)).status).toBe(400);
    }
    const { price, ...withoutPrice } = product;
    expect((await admin(seed.admin, "POST", "/api/admin/catalog", withoutPrice)).status).toBe(400);
  });

  test("PATCH: id inválido 400, inexistente 404, vacío 400", async () => {
    expect((await admin(seed.admin, "PATCH", "/api/admin/catalog/no-uuid", { price: 1 })).status).toBe(400);
    expect((await admin(seed.admin, "PATCH", "/api/admin/catalog/11111111-1111-4111-8111-111111111111", { price: 1 })).status).toBe(404);
    const { id } = ((await (await admin(seed.admin, "POST", "/api/admin/catalog", product)).json()) as any).product;
    expect((await admin(seed.admin, "PATCH", `/api/admin/catalog/${id}`, {})).status).toBe(400);
  });

  test("administradores y vendedores modifican el catálogo; mecánicos y clientes no", async () => {
    for (const user of [seed.mechanic, seed.clientA]) {
      expect((await admin(user, "POST", "/api/admin/catalog", product)).status).toBe(403);
      expect((await admin(user, "GET", "/api/admin/catalog")).status).toBe(403);
    }
    expect((await fetch(`${server.url}/api/admin/catalog`, { method: "POST" })).status).toBe(401);
  });

  test("el vendedor gestiona el catálogo pero no el resto de la administración", async () => {
    const created = await admin(seed.seller, "POST", "/api/admin/catalog", product);
    expect(created.status).toBe(201);
    const { id } = ((await created.json()) as any).product;
    expect((await admin(seed.seller, "PATCH", `/api/admin/catalog/${id}`, { price: 1000, stock: 2 })).status).toBe(200);
    expect((await admin(seed.seller, "GET", "/api/admin/catalog")).status).toBe(200);
    expect((await admin(seed.seller, "DELETE", `/api/admin/catalog/${id}`)).status).toBe(200);
    for (const path of ["/api/admin/metrics", "/api/admin/users", "/api/admin/audit-logs", "/api/admin/blocked-dates"]) {
      expect((await admin(seed.seller, "GET", path)).status).toBe(403);
    }
    expect((await admin(seed.seller, "PUT", "/api/admin/content", { values: { "shop.top.hidden": "1" } })).status).toBe(403);
  });
});
