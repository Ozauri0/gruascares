import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Protección de rutas por rol (T2.3).
// Etapa mock: se lee la cookie legible `gc_session` (valor = rol) que fija
// AuthContext en el login demostrativo. Al conectar el backend real (T1.3),
// el gating definitivo lo hace la API y aquí solo se conserva esta
// redirección UX; la cookie httpOnly `gc_token` no es legible desde el proxy.

type Role = "admin" | "mecanico" | "usuario";

const HOME: Record<Role, string> = {
  usuario: "/portal",
  mecanico: "/mecanico",
  admin: "/admin",
};

function getRole(request: NextRequest): Role | null {
  const value = request.cookies.get("gc_session")?.value;
  return value === "admin" || value === "mecanico" || value === "usuario" ? value : null;
}

function loginRedirect(request: NextRequest) {
  const url = new URL("/login", request.url);
  url.searchParams.set("redirect", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const role = getRole(request);

  if (!role) return loginRedirect(request);

  if (pathname.startsWith("/admin") && role !== "admin") {
    return NextResponse.redirect(new URL(HOME[role], request.url));
  }
  if (pathname.startsWith("/mecanico") && role !== "mecanico" && role !== "admin") {
    return NextResponse.redirect(new URL(HOME[role], request.url));
  }
  // /portal/*: basta con estar autenticado (cualquier rol).
  return NextResponse.next();
}

export const config = {
  matcher: ["/portal/:path*", "/mecanico/:path*", "/admin/:path*"],
};
