import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// CSP sin nonces (las páginas son estáticas). Orígenes externos usados hoy:
// Google Fonts (estilos y tipografías), el mapa embebido de Google Maps y las fotos de producto
// que el catálogo admite como URL https (por eso img-src acepta https:).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "frame-src 'self' https://www.google.com",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'", // solo este mismo sitio (la vista previa del panel de contenido)
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

// El navegador habla solo con este origen: /api/* se reenvía al backend (sin CORS y con la
// cookie httpOnly de sesión como cookie de primera parte).
const backendUrl = (process.env.BACKEND_URL || "http://localhost:4000").replace(/\/$/, "");

// En Docker (Dockerfile) se genera un servidor autónomo; en desarrollo y `next start` no hace falta.
const nextConfig: NextConfig = {
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
