import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad de las paginas de la aplicacion.
 *
 * Se aplican SOLO a las rutas de pagina (no a `/api/**`) para no duplicar las que
 * ya define cada endpoint: `/api/member-files/file` establece las suyas propias
 * (CSP estricta + nosniff) al entregar documentos.
 *
 * Ver `docs/SEGURIDAD_INTEGRAL.md` seccion 9.1.
 */
const SECURITY_HEADERS = [
  // Fuerza HTTPS y evita la degradacion a HTTP.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  // Evita que el navegador "adivine" el tipo de contenido.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Bloquea el clickjacking.
  { key: "X-Frame-Options", value: "DENY" },
  // No filtra rutas con cedulas a terceros.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Solo la app puede usar camara y ubicacion.
  {
    key: "Permissions-Policy",
    value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  // La CSP va primero en modo "Report-Only": se recogen infracciones sin bloquear
  // nada. Cuando el informe este limpio, se cambia a `Content-Security-Policy`.
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      // Next inyecta scripts inline; tesseract.js usa workers desde blob.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
      // Tailwind genera estilos inline.
      "style-src 'self' 'unsafe-inline'",
      // Imagenes locales, del bucket y capturas del escaner.
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "worker-src 'self' blob:",
      // Mapa de ubicacion (Leaflet/OpenStreetMap y el iframe de Google Maps).
      "frame-src 'self' https://www.google.com https://www.openstreetmap.org",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // `.prisma/client` es OBLIGATORIO para que Prisma funcione en Cloudflare
  // Workers (si no, usa la ruta de Node y falla con "fs.readFileSync is not
  // implemented yet"). Ver: opennextjs-cloudflare PR #628.
  serverExternalPackages: [
    "@prisma/client",
    ".prisma/client",
    "prisma",
    "@prisma/adapter-pg",
    "pg",
  ],
  // Las paginas de la app NO se cachean: asi cada despliegue llega de inmediato
  // al navegador (antes podia quedarse con una version vieja durante horas).
  async headers() {
    const noStore = [
      { key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" },
    ];

    return [
      "/",
      "/login",
      "/member-login",
      "/register",
      "/register-member",
      "/modelos/:path*",
      "/dashboard/:path*",
      "/admin/:path*",
    ].map((source) => ({ source, headers: [...SECURITY_HEADERS, ...noStore] }));
  },
};

export default nextConfig;
