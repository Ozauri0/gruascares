import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fetchSessionRole, guardDecision } from "./app/lib/route-guard";

// Protección de rutas por rol (T2.3 / issue #51): ver app/lib/route-guard.ts.
const BACKEND_URL = (process.env.BACKEND_URL || "http://localhost:4000").replace(/\/$/, "");

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const role = await fetchSessionRole(request.cookies.get("gc_token")?.value, BACKEND_URL);
  const decision = guardDecision(pathname, role);

  if (decision.type === "login") {
    const url = new URL("/login", request.url);
    url.searchParams.set("redirect", pathname + search);
    return NextResponse.redirect(url);
  }
  if (decision.type === "redirect") {
    return NextResponse.redirect(new URL(decision.to, request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/portal/:path*", "/mecanico/:path*", "/admin/:path*"],
};
