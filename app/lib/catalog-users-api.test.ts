import { afterEach, describe, expect, test } from "bun:test";
import { ApiError } from "./api";
import { toProduct } from "./api-adapters";
import { createProduct, deleteProduct, listAdminCatalog, listPublicCatalog, updateProduct } from "./catalog-api";
import { createStaff, listUsers, setUserActive } from "./users-api";

type Call = { url: string; init: RequestInit };
const realFetch = globalThis.fetch;
let calls: Call[] = [];
function respond(status: number, body?: unknown) {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}
afterEach(() => {
  globalThis.fetch = realFetch;
  calls = [];
});

const apiProduct = { id: "p1", name: "Aceite", description: "Lubricación", price: 32990, stock: 24, category: "TOP VENTAS", tag: "TOP 02", art: "oil", image: null, featured: true };
const apiUser = { id: "u1", name: "Ana", email: "a@b.cl", role: "mecanico", phone: null, isActive: true, createdAt: "2026-10-01T00:00:00Z" };

describe("INT-11: catálogo", () => {
  test("adapta description → text y completa `active` en la lectura pública", () => {
    expect(toProduct(apiProduct as never)).toEqual({ id: "p1", name: "Aceite", text: "Lubricación", price: 32990, stock: 24, category: "TOP VENTAS", tag: "TOP 02", art: "oil", image: null, featured: true, active: true });
    expect(toProduct({ ...apiProduct, active: false } as never).active).toBe(false);
  });

  test("lectura pública sin redirigir al login ante 401", async () => {
    const assigned: string[] = [];
    (globalThis as { window?: unknown }).window = { location: { pathname: "/catalogo", search: "", assign: (u: string) => assigned.push(u) } };
    respond(401, { error: "Unauthorized", message: "x" });
    await listPublicCatalog().catch(() => null);
    expect(assigned).toHaveLength(0);
    (globalThis as { window?: unknown }).window = undefined;

    respond(200, { products: [apiProduct] });
    expect((await listPublicCatalog())[0].name).toBe("Aceite");
    expect(calls.at(-1)?.url).toBe("/api/catalog");
  });

  test("admin: lista, crea, edita y elimina", async () => {
    respond(200, { products: [apiProduct] });
    expect(await listAdminCatalog()).toHaveLength(1);
    expect(calls[0].url).toBe("/api/admin/catalog");

    respond(201, { product: apiProduct });
    await createProduct({ name: "Aceite", description: "d", category: "x", price: 1, stock: 2, art: "oil", featured: false });
    expect(calls[1].init.method).toBe("POST");

    respond(200, { product: { ...apiProduct, price: 100 } });
    expect((await updateProduct("p 1", { price: 100 })).price).toBe(100);
    expect(calls[2].url).toBe("/api/admin/catalog/p%201");
    expect(JSON.parse(String(calls[2].init.body))).toEqual({ price: 100 });

    respond(200, { deletedId: "p1" });
    await deleteProduct("p1");
    expect(calls[3].init.method).toBe("DELETE");
  });

  test("una imagen no permitida llega como ApiError 400 con el motivo", async () => {
    respond(400, { error: "Bad Request", message: "La imagen debe ser null, una ruta /images/... o una URL https (máx. 500 caracteres)" });
    const error = (await updateProduct("p1", { image: "http://x" }).catch((e) => e)) as ApiError;
    expect(error.status).toBe(400);
    expect(error.message).toContain("URL https");
  });
});

describe("INT-11: usuarios", () => {
  test("listUsers envía búsqueda y rol del servidor, omite 'todos' y vacíos", async () => {
    respond(200, { users: [apiUser], total: 1, page: 1, limit: 50 });
    const page = await listUsers({ q: "  ana ", role: "mecanico", page: 2 });
    expect(calls[0].url).toBe("/api/admin/users?q=ana&role=mecanico&page=2&limit=50");
    expect(page.users[0]).toMatchObject({ name: "Ana", role: "mecanico", isActive: true });

    respond(200, { users: [], total: 0, page: 1, limit: 50 });
    await listUsers({ q: "", role: "todos" });
    expect(calls[1].url).toBe("/api/admin/users?limit=50");
  });

  test("createStaff omite el teléfono vacío", async () => {
    respond(201, { user: apiUser });
    await createStaff({ name: "Ana", email: "a@b.cl", phone: "  ", roles: ["mecanico"], password: "clave-inicial-1" });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ name: "Ana", email: "a@b.cl", roles: ["mecanico"], password: "clave-inicial-1" });
  });

  test("correo repetido llega como 409", async () => {
    respond(409, { error: "Conflict", message: "Ya existe una cuenta registrada con este correo electrónico" });
    const error = (await createStaff({ name: "Ana", email: "a@b.cl", phone: "", roles: ["admin"], password: "clave-inicial-1" }).catch((e) => e)) as ApiError;
    expect(error.status).toBe(409);
  });

  test("setUserActive hace PATCH y propaga el bloqueo de auto-desactivación", async () => {
    respond(200, { user: { ...apiUser, isActive: false } });
    expect((await setUserActive("u1", false)).isActive).toBe(false);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ isActive: false });

    respond(409, { error: "Conflict", message: "No puedes quitarte tu propio acceso de administrador ni desactivar tu propia cuenta" });
    const error = (await setUserActive("yo", false).catch((e) => e)) as ApiError;
    expect(error.status).toBe(409);
    expect(error.message).toContain("tu propia cuenta");
  });
});
