/**
 * Experimento: ¿la lectura del worker ve los cambios hechos justo antes?
 * Crea un expediente, lo actualiza por Prisma y consulta el endpoint real varias veces.
 *
 * Uso: node scripts/tmp-check-stale-read.mjs
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const BASE = "https://sanmerida-com.alexruizrondon.workers.dev";
const TEAM_EMAIL = "e2e.team@sanmerida.test";
const TEAM_PASSWORD = "PruebaE2E2026";
const CEDULA = "99999999";

const adapter = new PrismaPg({
  connectionString: (process.env.DATABASE_URL ?? "").trim().replace(/^['"]|['"]$/g, ""),
  maxUses: 1,
});

const prisma = new PrismaClient({ adapter });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readApi(cookie) {
  const response = await fetch(`${BASE}/api/member-files/profile?cedula=${CEDULA}`, { headers: { Cookie: cookie } });
  const json = await response.json().catch(() => ({}));
  return json?.profile?.ubicacionLat ?? null;
}

async function cleanup() {
  const profile = await prisma.memberProfile.findUnique({ where: { cedula: CEDULA } });
  if (profile) {
    await prisma.installmentPayment.deleteMany({ where: { profileId: profile.id } });
    await prisma.advancePayment.deleteMany({ where: { profileId: profile.id } });
    await prisma.memberAsset.deleteMany({ where: { profileId: profile.id } });
    await prisma.memberProfile.delete({ where: { id: profile.id } });
  }
  await prisma.user.deleteMany({ where: { email: TEAM_EMAIL } });
}

async function main() {
  await cleanup();

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

  await prisma.memberProfile.create({
    data: {
      cedula: CEDULA,
      nombre: "Prueba",
      apellido: "Stale",
      telefono: "04140000000",
      email: "e2e.prueba.stale@sanmerida.test",
      direccion: "Prueba de lectura",
      ocupacion: "Tester",
      empresa: "San Merida Sede Principal",
      operationalGroup: "Grupo 01",
    },
  });

  console.log(`API antes de actualizar      -> ubicacionLat = ${await readApi(cookie)}`);

  await prisma.memberProfile.update({ where: { cedula: CEDULA }, data: { ubicacionLat: 8.5897, ubicacionLng: -71.1446 } });
  console.log("Prisma actualizo ubicacionLat = 8.5897");

  const dbNow = await prisma.memberProfile.findUnique({ where: { cedula: CEDULA } });
  console.log(`BD directa (inmediato)       -> ubicacionLat = ${dbNow?.ubicacionLat}`);
  console.log(`API (inmediato)              -> ubicacionLat = ${await readApi(cookie)}`);

  await sleep(3000);
  console.log(`API (+3s)                    -> ubicacionLat = ${await readApi(cookie)}`);

  await sleep(7000);
  console.log(`API (+10s)                   -> ubicacionLat = ${await readApi(cookie)}`);

  await sleep(20000);
  console.log(`API (+30s)                   -> ubicacionLat = ${await readApi(cookie)}`);

  await sleep(30000);
  console.log(`API (+60s)                   -> ubicacionLat = ${await readApi(cookie)}`);
}

main()
  .catch((error) => {
    console.error("[ERROR]", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    console.log("Limpieza OK");
    await prisma.$disconnect().catch(() => undefined);
  });
