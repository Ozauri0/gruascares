import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import fs from "fs";
import { cookieFor, dbReady, resetDb, seedBasics, type Seed } from "./db.js";
import { startServer, type TestServer } from "./helpers.js";

/** Contenido editable de la web (textos e imágenes) y subida de imágenes. */
let server: TestServer;
let seed: Seed;
beforeAll(async () => {
  if (dbReady) server = await startServer();
});
afterAll(async () => {
  if (server) await server.close();
  fs.rmSync(process.env.UPLOADS_DIR!, { recursive: true, force: true }); // carpeta temporal de setup.ts
});
beforeEach(async () => {
  if (!dbReady) return;
  await resetDb();
  seed = await seedBasics();
});

type U = { id: string; email: string; name: string; role: "admin" | "mecanico" | "usuario"; tokenVersion?: number };
const call = async (user: U | null, method: string, path: string, body?: unknown) => {
  const headers = user ? cookieFor(user) : { "Content-Type": "application/json" };
  const res = await fetch(`${server.url}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
};
const upload = async (user: U, bytes: Uint8Array, type: string) => {
  const res = await fetch(`${server.url}/api/admin/uploads`, {
    method: "POST",
    headers: { ...cookieFor(user), "Content-Type": type },
    body: bytes,
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
};
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);

describe.skipIf(!dbReady)("contenido editable", () => {
  test("lectura pública vacía; solo el admin guarda", async () => {
    expect((await call(null, "GET", "/api/content")).body.content).toEqual({});
    expect((await call(seed.mechanic, "PUT", "/api/admin/content", { values: { "hero.title": "x" } })).status).toBe(403);
    expect((await call(seed.clientA, "PUT", "/api/admin/content", { values: { "hero.title": "x" } })).status).toBe(403);
    expect((await call(null, "PUT", "/api/admin/content", { values: {} })).status).toBe(401);
  });

  test("guarda, actualiza y restaura valores", async () => {
    const save = (values: object) => call(seed.admin, "PUT", "/api/admin/content", { values });
    expect((await save({ "hero.title": "Nuevo título", "hero.copy": "Texto" })).status).toBe(200);
    expect((await call(null, "GET", "/api/content")).body.content).toEqual({ "hero.title": "Nuevo título", "hero.copy": "Texto" });

    await save({ "hero.title": "Otro título", "hero.copy": null });
    expect((await call(null, "GET", "/api/content")).body.content).toEqual({ "hero.title": "Otro título" });
    await save({ "hero.title": "   " }); // vacío = restaurar
    expect((await call(null, "GET", "/api/content")).body.content).toEqual({});
  });

  test("valida claves, tamaños e imágenes", async () => {
    const save = (values: unknown) => call(seed.admin, "PUT", "/api/admin/content", { values });
    expect((await save({ "Clave Mala!": "x" })).status).toBe(400);
    expect((await save({ "a.b": 5 })).status).toBe(400);
    expect((await save({ "a.b": "x".repeat(2001) })).status).toBe(400);
    expect((await save([])).status).toBe(400);
    expect((await save({})).status).toBe(400);
    expect((await save({ "hero.slide1.image": "https://externo.com/a.png" })).status).toBe(400);
    expect((await save({ "hero.slide1.image": "javascript:alert(1)" })).status).toBe(400);
    expect((await save({ "hero.slide1.image": "/images/../secreto" })).status).toBe(400);
    expect((await save({ "hero.slide1.image": "/images/carousel-02.webp" })).status).toBe(200);
  });

  test("el texto se guarda tal cual (no se interpreta como HTML)", async () => {
    await call(seed.admin, "PUT", "/api/admin/content", { values: { "hero.title": "<script>alert(1)</script>" } });
    expect((await call(null, "GET", "/api/content")).body.content["hero.title"]).toBe("<script>alert(1)</script>");
  });

  test("subida de imágenes: valida el contenido real, el tamaño y el rol", async () => {
    const ok = await upload(seed.admin, PNG, "image/png");
    expect(ok.status).toBe(201);
    expect(ok.body.url).toMatch(/^\/api\/uploads\/[0-9a-f-]{36}\.png$/);

    const served = await fetch(`${server.url}${ok.body.url}`);
    expect(served.status).toBe(200);
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");

    // Una imagen subida se puede usar como contenido.
    expect((await call(seed.admin, "PUT", "/api/admin/content", { values: { "hero.slide1.image": ok.body.url } })).status).toBe(200);

    expect((await upload(seed.admin, new TextEncoder().encode("<script>alert(1)</script>"), "image/png")).status).toBe(415); // tipo declarado falso
    expect((await upload(seed.admin, PNG, "text/html")).status).toBe(415);
    expect((await upload(seed.admin, new Uint8Array(5 * 1024 * 1024 + 10).fill(1), "image/png")).status).toBe(413);
    expect((await upload(seed.mechanic, PNG, "image/png")).status).toBe(403);
    expect((await fetch(`${server.url}/api/uploads/../../.env`)).status).toBe(404);
  });
});
