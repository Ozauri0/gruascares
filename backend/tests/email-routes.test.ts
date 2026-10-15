import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { authHeaders, startServer, tokenFor, type TestServer } from "./helpers.js";

let server: TestServer;
beforeAll(async () => {
  server = await startServer();
});
afterAll(async () => {
  await server.close();
});

describe("SEC-1: /api/email protegido", () => {
  test("test sin sesión devuelve 401", async () => {
    const res = await fetch(`${server.url}/api/email/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: "victima@example.com" }),
    });
    expect(res.status).toBe(401);
  });

  test("preview sin sesión devuelve 401", async () => {
    const res = await fetch(`${server.url}/api/email/preview/welcome`);
    expect(res.status).toBe(401);
  });

  test("cliente y mecánico reciben 403", async () => {
    for (const role of ["usuario", "mecanico"] as const) {
      const res = await fetch(`${server.url}/api/email/test`, {
        method: "POST",
        headers: authHeaders(role),
        body: "{}",
      });
      expect(res.status).toBe(403);
    }
  });

  test("admin solo puede enviarse a sí mismo (ignora 'to')", async () => {
    const res = await fetch(`${server.url}/api/email/test`, {
      method: "POST",
      headers: authHeaders("admin"),
      body: JSON.stringify({ to: "victima@example.com", type: "welcome" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.recipient).toBe("admin@test.local");
  });

  test("tipo inválido devuelve 400", async () => {
    const res = await fetch(`${server.url}/api/email/test`, {
      method: "POST",
      headers: authHeaders("admin"),
      body: JSON.stringify({ type: "otro" }),
    });
    expect(res.status).toBe(400);
  });

  test("admin puede ver la previsualización", async () => {
    const res = await fetch(`${server.url}/api/email/preview/welcome`, {
      headers: { Cookie: `gc_token=${tokenFor("admin")}` },
    });
    expect(res.status).toBe(200);
  });
});

describe("SEC-1: deshabilitado en producción", () => {
  test("no se monta /api/email con NODE_ENV=production", async () => {
    const proc = Bun.spawnSync({
      cmd: [
        "bun",
        "-e",
        `process.env.NODE_ENV="production";process.env.JWT_SECRET="x".repeat(40);process.env.CORS_ORIGIN="http://localhost:3000";process.env.DATABASE_URL="postgres://x";
         const {createApp}=await import("./src/app.js");const app=createApp();
         const s=app.listen(0,async()=>{const r=await fetch("http://127.0.0.1:"+s.address().port+"/api/email/preview/welcome");console.log(r.status);s.close()})`,
      ],
      cwd: import.meta.dir + "/..",
    });
    expect(proc.stdout.toString().trim().split("\n").pop()).toBe("404");
  });
});
