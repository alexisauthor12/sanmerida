import type { NextConfig } from "next";

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
    ].map((source) => ({ source, headers: noStore }));
  },
};

export default nextConfig;
