import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { cookieFor, dbReady, futureDate, resetDb, seedBasics, type Seed } from "./db.js";
import { startServer, type TestServer } from "./helpers.js";

describe.skipIf(!dbReady)("#195: servicios y categorías del catálogo", () => {
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
  type Res = Omit<Response, "json"> & { json(): Promise<any> };
  const call = (user: U | null, method: string, path: string, body?: unknown): Promise<Res> =>
    fetch(`${server.url}${path}`, { method, headers: user ? cookieFor(user) : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const svc = { category: "serviteca", name: "Alineación", description: "Alineación computarizada", basePrice: 30000, estimatedDurationMin: 60 };

  describe("servicios", () => {
    test("solo el admin los gestiona", async () => {
      expect((await call(null, "GET", "/api/admin/services")).status).toBe(401);
      for (const user of [seed.clientA, seed.mechanic, seed.seller, seed.crane]) {
        expect((await call(user, "GET", "/api/admin/services")).status).toBe(403);
        expect((await call(user, "POST", "/api/admin/services", svc)).status).toBe(403);
        expect((await call(user, "PATCH", `/api/admin/services/${seed.serviceGrua.id}`, { name: "Otro" })).status).toBe(403);
        expect((await call(user, "DELETE", `/api/admin/services/${seed.serviceGrua.id}`)).status).toBe(403);
      }
    });

    test("crea un servicio y aparece en /api/appointments/services", async () => {
      const res = await call(seed.admin, "POST", "/api/admin/services", svc);
      expect(res.status).toBe(201);
      const { service } = await res.json();
      expect(service).toMatchObject({ name: "Alineación", category: "serviteca", isActive: true, appointmentCount: 0 });
      const list = await (await fetch(`${server.url}/api/appointments/services`)).json() as any;
      expect(list.services.map((s: { name: string }) => s.name)).toContain("Alineación");
    });

    test("valida el cuerpo y rechaza duplicados", async () => {
      for (const bad of [
        { ...svc, category: "otra" },
        { ...svc, name: "x" },
        { ...svc, basePrice: -1 },
        { ...svc, basePrice: 10.5 },
        { ...svc, estimatedDurationMin: 0 },
        { ...svc, isActive: "si" },
        { ...svc, description: "x".repeat(1001) },
      ]) {
        expect((await call(seed.admin, "POST", "/api/admin/services", bad)).status).toBe(400);
      }
      expect((await call(seed.admin, "POST", "/api/admin/services", svc)).status).toBe(201);
      expect((await call(seed.admin, "POST", "/api/admin/services", { ...svc, name: "ALINEACIÓN" })).status).toBe(409);
      expect((await call(seed.admin, "PATCH", "/api/admin/services/no-uuid", { name: "Algo" })).status).toBe(400);
      expect((await call(seed.admin, "PATCH", `/api/admin/services/${seed.serviceGrua.id}`, {})).status).toBe(400);
      expect((await call(seed.admin, "PATCH", "/api/admin/services/123e4567-e89b-42d3-a456-426614174000", { name: "Algo" })).status).toBe(404);
    });

    test("un servicio inactivo no sale en /agendar pero sigue en el admin; reactivar lo devuelve", async () => {
      const off = await call(seed.admin, "PATCH", `/api/admin/services/${seed.serviceAceite.id}`, { isActive: false });
      expect(off.status).toBe(200);
      const names = async () => (await (await fetch(`${server.url}/api/appointments/services`)).json() as any).services.map((s: { name: string }) => s.name);
      expect(await names()).not.toContain("Aceite Test");
      const all = (await (await call(seed.admin, "GET", "/api/admin/services")).json()).services;
      expect(all.find((s: { name: string }) => s.name === "Aceite Test").isActive).toBe(false);
      await call(seed.admin, "PATCH", `/api/admin/services/${seed.serviceAceite.id}`, { isActive: true });
      expect(await names()).toContain("Aceite Test");
    });

    test("editar un servicio no rompe las citas existentes; con citas no se borra, sin citas sí", async () => {
      const cita = await call(seed.clientA, "POST", "/api/appointments", {
        serviceId: seed.serviceAceite.id,
        vehicleId: seed.vehicleA.id,
        scheduledDate: futureDate(),
        timeSlot: "10:30",
      });
      expect(cita.status).toBe(201);
      const edit = await call(seed.admin, "PATCH", `/api/admin/services/${seed.serviceAceite.id}`, { name: "Aceite renombrado", basePrice: 40000 });
      expect(edit.status).toBe(200);
      expect((await edit.json()).service).toMatchObject({ name: "Aceite renombrado", basePrice: 40000, appointmentCount: 1 });
      const del = await call(seed.admin, "DELETE", `/api/admin/services/${seed.serviceAceite.id}`);
      expect(del.status).toBe(409);
      expect((await call(seed.admin, "DELETE", `/api/admin/services/${seed.serviceGrua.id}`)).status).toBe(200);
      expect((await call(seed.admin, "DELETE", `/api/admin/services/${seed.serviceGrua.id}`)).status).toBe(404);
    });
  });

  describe("categorías del catálogo", () => {
    const names = async () => ((await (await fetch(`${server.url}/api/catalog/categories`)).json()) as any).categories.map((c: { name: string }) => c.name);
    const product = { name: "Aceite 15W40", description: "x", price: 1000, stock: 5, art: "oil" };

    test("lectura pública ordenada y con caché corta", async () => {
      const res = await fetch(`${server.url}/api/catalog/categories`);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toContain("max-age");
      expect(await names()).toEqual(["TOP VENTAS", "LUBRICANTES", "GENERAL"]);
    });

    test("crear, renombrar y ordenar: solo admin gestiona; el vendedor solo lee", async () => {
      expect((await call(null, "POST", "/api/admin/catalog-categories", { name: "Frenos" })).status).toBe(401);
      expect((await call(seed.seller, "POST", "/api/admin/catalog-categories", { name: "Frenos" })).status).toBe(403);
      expect((await call(seed.mechanic, "GET", "/api/admin/catalog-categories")).status).toBe(403);
      expect((await call(seed.seller, "GET", "/api/admin/catalog-categories")).status).toBe(200);

      const created = await call(seed.admin, "POST", "/api/admin/catalog-categories", { name: "  frenos  y  discos " });
      expect(created.status).toBe(201);
      const { category } = await created.json();
      expect(category.name).toBe("FRENOS Y DISCOS");
      expect(await names()).toEqual(["TOP VENTAS", "LUBRICANTES", "GENERAL", "FRENOS Y DISCOS"]);
      expect((await call(seed.admin, "POST", "/api/admin/catalog-categories", { name: "frenos y discos" })).status).toBe(409);
      expect((await call(seed.admin, "POST", "/api/admin/catalog-categories", { name: "x" })).status).toBe(400);

      const patched = await call(seed.admin, "PATCH", `/api/admin/catalog-categories/${category.id}`, { name: "Frenos" });
      expect(patched.status).toBe(200);
      expect((await patched.json()).category.name).toBe("FRENOS");
      expect((await call(seed.admin, "PATCH", `/api/admin/catalog-categories/${category.id}`, { name: "general" })).status).toBe(409);
      expect((await call(seed.admin, "PATCH", `/api/admin/catalog-categories/${category.id}`, {})).status).toBe(400);

      const list = (await (await call(seed.admin, "GET", "/api/admin/catalog-categories")).json()).categories as { id: string; name: string }[];
      const reordered = [...list].reverse().map((c) => c.id);
      expect((await call(seed.admin, "PUT", "/api/admin/catalog-categories/order", { ids: reordered })).status).toBe(200);
      expect(await names()).toEqual(["FRENOS", "GENERAL", "LUBRICANTES", "TOP VENTAS"]);
      expect((await call(seed.admin, "PUT", "/api/admin/catalog-categories/order", { ids: reordered.slice(1) })).status).toBe(400);
      expect((await call(seed.admin, "PUT", "/api/admin/catalog-categories/order", { ids: [] })).status).toBe(400);
    });

    test("el producto exige una categoría existente; renombrar la categoría arrastra a sus productos", async () => {
      const bad = await call(seed.admin, "POST", "/api/admin/catalog", { ...product, category: "Inventada" });
      expect(bad.status).toBe(400);
      const ok = await call(seed.admin, "POST", "/api/admin/catalog", { ...product, category: "lubricantes" });
      expect(ok.status).toBe(201);
      const created = (await ok.json()).product;
      expect(created.category).toBe("LUBRICANTES");
      expect((await call(seed.admin, "PATCH", `/api/admin/catalog/${created.id}`, { category: "Otra" })).status).toBe(400);
      const sinCategoria = await call(seed.admin, "POST", "/api/admin/catalog", { ...product, name: "Sin categoría" });
      expect((await sinCategoria.json()).product.category).toBe("GENERAL");

      const cats = (await (await call(seed.admin, "GET", "/api/admin/catalog-categories")).json()).categories as { id: string; name: string; productCount: number }[];
      const lub = cats.find((c) => c.name === "LUBRICANTES")!;
      expect(lub.productCount).toBe(1);
      await call(seed.admin, "PATCH", `/api/admin/catalog-categories/${lub.id}`, { name: "Aceites" });
      const after = (await (await call(seed.admin, "GET", "/api/admin/catalog")).json()).products;
      expect(after.find((p: { id: string }) => p.id === created.id).category).toBe("ACEITES");
    });

    test("quitar una categoría con productos se impide salvo que se reasigne", async () => {
      await call(seed.admin, "POST", "/api/admin/catalog", { ...product, category: "TOP VENTAS" });
      const cats = (await (await call(seed.admin, "GET", "/api/admin/catalog-categories")).json()).categories as { id: string; name: string }[];
      const top = cats.find((c) => c.name === "TOP VENTAS")!;
      const general = cats.find((c) => c.name === "GENERAL")!;
      const lub = cats.find((c) => c.name === "LUBRICANTES")!;

      expect((await call(seed.admin, "DELETE", `/api/admin/catalog-categories/${top.id}`)).status).toBe(409);
      expect((await call(seed.admin, "DELETE", `/api/admin/catalog-categories/${top.id}?reassignTo=${top.id}`)).status).toBe(400);
      expect((await call(seed.admin, "DELETE", `/api/admin/catalog-categories/${top.id}?reassignTo=123e4567-e89b-42d3-a456-426614174000`)).status).toBe(422);
      const moved = await call(seed.admin, "DELETE", `/api/admin/catalog-categories/${top.id}?reassignTo=${general.id}`);
      expect(moved.status).toBe(200);
      expect((await moved.json()).reassigned).toBe(1);
      const products = (await (await call(seed.admin, "GET", "/api/admin/catalog")).json()).products;
      expect(products[0].category).toBe("GENERAL");
      // vacía: se quita directo
      expect((await call(seed.admin, "DELETE", `/api/admin/catalog-categories/${lub.id}`)).status).toBe(200);
      expect((await call(seed.admin, "DELETE", `/api/admin/catalog-categories/${lub.id}`)).status).toBe(404);
      expect(await names()).toEqual(["GENERAL"]);
    });
  });
});
