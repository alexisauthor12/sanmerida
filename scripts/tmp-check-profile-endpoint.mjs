/**
 * Diagnóstico: ¿por qué /api/member-files/profile devuelve datos viejos?
 * Compara la lectura directa a Supabase con la respuesta del endpoint real,
 * e inspecciona cabeceras de caché.
 *
 * Uso: node scripts/tmp-check-profile-endpoint.mjs
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const BASE = "https://sanmerida-com.alexruizrondon.workers.dev";
const TEAM_EMAIL = "e2e.team@sanmerida.test";
const TEAM_PASSWORD = "PruebaE2E2026";

const adapter = new PrismaPg({
  connectionString: (process.env.DATABASE_URL ?? "").trim().replace(/^['"]|['"]$/g, ""),
  maxUses: 1,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.user.deleteMany({ where: { email: TEAM_EMAIL } });
  await prisma.user.create({
    data: {
      nombre: "E2E",
      apellido: "Prueba",
      email: TEAM_EMAIL,
      telefono: "0000000000",
      passwordHash: await bcrypt.hash(TEAM_PASSWORD, 12),
      isMember: false,
    },
  });

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEAM_EMAIL, password: TEAM_PASSWORD, portal: "account" }),
  });
  const cookies =
    typeof login.headers.getSetCookie === "function" ? login.headers.getSetCookie() : [login.headers.get("set-cookie") ?? ""];
  const cookie = cookies.filter(Boolean).map((value) => value.split(";")[0]).join("; ");
  console.log(`login: ${login.status}`);

  for (const cedula of ["31033017", "32464663", "99999999"]) {
    const db = await prisma.memberProfile.findUnique({ where: { cedula } });
    const response = await fetch(`${BASE}/api/member-files/profile?cedula=${cedula}`, {
      headers: { Cookie: cookie, "Cache-Control": "no-cache" },
    });
    const text = await response.text();
    let api = null;
    try {
      api = JSON.parse(text).profile;
    } catch {
      api = null;
    }

    console.log(`\n=== cedula ${cedula} ===`);
    console.log(`  BD  -> username=${db?.username} motoSlug=${db?.motoSlug} ubicacionLat=${db?.ubicacionLat}`);
    console.log(`  API -> username=${api?.username} motoSlug=${api?.motoSlug} ubicacionLat=${api?.ubicacionLat} (status ${response.status})`);
    console.log(
      `  cache-control=${response.headers.get("cache-control")} cf-cache-status=${response.headers.get("cf-cache-status")} age=${response.headers.get("age")}`
    );
  }

  // Segunda vuelta inmediata para ver si cambia (caché)
  const again = await fetch(`${BASE}/api/member-files/profile?cedula=31033017`, { headers: { Cookie: cookie } });
  const againJson = await again.json().catch(() => ({}));
  console.log(`\nSegunda llamada 31033017 -> username=${againJson?.profile?.username}`);

  await prisma.user.deleteMany({ where: { email: TEAM_EMAIL } });
  console.log("\nLimpieza OK");
}

main()
  .catch((error) => {
    console.error("[ERROR]", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
