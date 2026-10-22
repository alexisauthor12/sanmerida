/**
 * Diagnóstico: ¿funciona la subida de documentos en producción?
 * El endpoint usa fs/promises + sharp sobre el disco local, que en Cloudflare
 * Workers es efímero (o inexistente). Esto lo comprueba de verdad.
 *
 * Uso: node scripts/tmp-check-upload-production.mjs
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const BASE = "https://sanmerida-com.alexruizrondon.workers.dev";
const TEAM_EMAIL = "e2e.team@sanmerida.test";
const TEAM_PASSWORD = "PruebaE2E2026";
const CEDULA = "99999999";

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64"
);

const adapter = new PrismaPg({
  connectionString: (process.env.DATABASE_URL ?? "").trim().replace(/^['"]|['"]$/g, ""),
  maxUses: 1,
});

const prisma = new PrismaClient({ adapter });

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
  console.log(`login: ${login.status}`);

  const form = new FormData();
  form.set("cedula", CEDULA);
  form.set("assetType", "DOCUMENT");
  form.set("documentKey", "identidad");
  form.set("variant", "NORMAL");
  form.set("file", new Blob([PNG_1PX], { type: "image/png" }), "prueba.png");

  const upload = await fetch(`${BASE}/api/member-files/upload`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: form,
  });
  const uploadText = await upload.text();
  console.log(`\nUPLOAD status=${upload.status}`);
  console.log(`UPLOAD body=${uploadText.slice(0, 600)}`);

  let filePath = "";
  try {
    filePath = JSON.parse(uploadText)?.asset?.filePath ?? "";
  } catch {
    filePath = "";
  }

  if (filePath) {
    const publicUrl = `${BASE}${filePath.startsWith("/") ? "" : "/"}${filePath}`;
    const fileResponse = await fetch(publicUrl);
    console.log(`\nGET ${publicUrl} -> status=${fileResponse.status} bytes=${(await fileResponse.arrayBuffer()).byteLength}`);

    const assetRow = await prisma.memberAsset.findFirst({ where: { filePath } });
    console.log(`Fila en BD: ${assetRow ? "SI" : "NO"} (${filePath})`);
  } else {
    console.log("\nNo se obtuvo filePath: la subida no se completó.");
  }
}

main()
  .catch((error) => {
    console.error("[ERROR]", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    console.log("\nLimpieza OK");
    await prisma.$disconnect().catch(() => undefined);
  });
