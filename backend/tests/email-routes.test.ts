import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { cookieFor, dbReady, resetDb, seedBasics, type Seed } from "./db.js";
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

describe.skipIf(!dbReady)("SEC-1: /api/email protegido", () => {
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
    for (const user of [seed.clientA, seed.mechanic]) {
      const res = await fetch(`${server.url}/api/email/test`, {
        method: "POST",
        headers: cookieFor(user),
        body: "{}",
      });
      expect(res.status).toBe(403);
    }
  });

  test("admin solo puede enviarse a sí mismo (ignora 'to')", async () => {
    const res = await fetch(`${server.url}/api/email/test`, {
      method: "POST",
      headers: cookieFor(seed.admin),
      body: JSON.stringify({ to: "victima@example.com", type: "welcome" }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json() as any);
    expect(data.recipient).toBe(seed.admin.email);
  });

  test("tipo inválido devuelve 400", async () => {
    const res = await fetch(`${server.url}/api/email/test`, {
      method: "POST",
      headers: cookieFor(seed.admin),
      body: JSON.stringify({ type: "otro" }),
    });
    expect(res.status).toBe(400);
  });

  test("admin puede ver la previsualización", async () => {
    const res = await fetch(`${server.url}/api/email/preview/welcome`, { headers: cookieFor(seed.admin) });
    expect(res.status).toBe(200);
  });
});

describe("SEC-1: deshabilitado en producción", () => {
  test("no se monta /api/email con NODE_ENV=production", async () => {
    const proc = Bun.spawnSync({
      cmd: [
        "bun",
        "-e",
        `process.env.NODE_ENV="production";process.env.DEMO_MODE="false";process.env.JWT_SECRET="x".repeat(40);process.env.CORS_ORIGIN="http://localhost:3000";process.env.DATABASE_URL="postgres://x";
         const {createApp}=await import("./src/app.js");const app=createApp();
         const s=app.listen(0,async()=>{const r=await fetch("http://127.0.0.1:"+s.address().port+"/api/email/preview/welcome");console.log(r.status);s.close()})`,
      ],
      cwd: import.meta.dir + "/..",
    });
    expect(proc.stdout.toString().trim().split("\n").pop()).toBe("404");
  });
});
