import type { NextConfig } from "next";

/**
 * Politica de seguridad de contenido (CSP).
 *
 * Se envia **en firme** (`Content-Security-Policy`) y, ademas, una version mas
 * estricta en modo informe (`-Report-Only`) para seguir midiendo el camino hacia
 * una CSP sin `unsafe-inline` (requiere nonces generados en el middleware).
 *
 * Origenes externos verificados en el codigo (no se permite nada mas):
 *   - tiles del mapa:      https://{s}.tile.openstreetmap.org  -> img-src
 *   - buscar direccion:    https://nominatim.openstreetmap.org -> connect-src
 *   - mapa embebido:       https://www.openstreetmap.org/...   -> frame-src
 *   - mapa de contacto:    https://www.google.com/maps?...     -> frame-src
 *   - imagenes del feed:   cualquier https (el admin pega URLs)
 *
 * El OCR (tesseract.js) corre en el SERVIDOR (`/api/member-files/scan`), asi que
 * no necesita ninguna directiva del navegador.
 *
 * Ver `docs/SEGURIDAD_INTEGRAL.md` seccion 9.1.
 */
const esProduccion = process.env.NODE_ENV === "production";

const CSP_APLICADA = [
  "default-src 'self'",
  // Next inyecta el arranque de la hidratacion inline; sin nonces hay que
  // permitirlo. `unsafe-eval` NO se incluye en produccion: solo lo necesita el
  // HMR de webpack en desarrollo.
  `script-src 'self' 'unsafe-inline'${esProduccion ? "" : " 'unsafe-eval'"}`,
  // Tailwind genera estilos inline.
  "style-src 'self' 'unsafe-inline'",
  // Imagenes locales, capturas del escaner (blob) y tiles del mapa / feed (https).
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // El propio API y Nominatim (busqueda de direcciones del mapa).
  "connect-src 'self' https:",
  "worker-src 'self' blob:",
  // Mapas embebidos: OpenStreetMap (previsualizacion) y Google Maps (contacto).
  "frame-src 'self' https://www.google.com https://www.openstreetmap.org",
  // Nadie puede embeber el sitio (bloquea el clickjacking).
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
  // A donde van los informes. Sin esto la politica en modo informe no sirve de
  // nada: nadie se enteraria de lo que habria bloqueado.
  // `report-uri` esta obsoleto pero es el que entienden todos los navegadores;
  // `report-to` es el moderno (necesita la cabecera `Reporting-Endpoints`).
  "report-uri /api/csp-report",
  "report-to csp-endpoint",
].join("; ");

/**
 * Objetivo mas estricto: sin `unsafe-inline`. Va en modo informe para detectar
 * que lo bloquea antes de activarlo (necesita nonces en el middleware).
 */
const CSP_OBJETIVO = CSP_APLICADA.replace(
  /script-src 'self' 'unsafe-inline'/,
  "script-src 'self'",
).replace(/style-src 'self' 'unsafe-inline'/, "style-src 'self'");

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
  // Nombre del endpoint de informes que referencia `report-to` en la CSP.
  { key: "Reporting-Endpoints", value: 'csp-endpoint="/api/csp-report"' },
  // CSP en firme: bloquea inyeccion de scripts externos, exfiltracion de datos,
  // objetos embebidos y clickjacking.
  { key: "Content-Security-Policy", value: CSP_APLICADA },
  // Y el objetivo mas estricto, solo para medir.
  { key: "Content-Security-Policy-Report-Only", value: CSP_OBJETIVO },
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
