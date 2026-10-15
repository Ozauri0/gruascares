import type { Server } from "node:http";
import { createApp, type AppOptions } from "../src/app.js";
import { generateToken } from "../src/utils/jwt.js";
import type { UserRole } from "../src/types/auth.js";

export interface TestServer {
  url: string;
  close: () => Promise<void>;
}

export async function startServer(options: AppOptions = {}): Promise<TestServer> {
  const app = createApp(options);
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export function tokenFor(role: UserRole, extra: Partial<{ userId: string; email: string; name: string }> = {}): string {
  return generateToken({
    userId: extra.userId ?? "00000000-0000-4000-8000-0000000000aa",
    email: extra.email ?? `${role}@test.local`,
    name: extra.name ?? `Test ${role}`,
    role,
  });
}

export function authHeaders(role: UserRole): Record<string, string> {
  return { Cookie: `gc_token=${tokenFor(role)}`, "Content-Type": "application/json" };
}
