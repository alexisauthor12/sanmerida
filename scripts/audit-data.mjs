/**
 * AUDITORÍA DE DATOS (solo lectura) — detecta:
 *  - Integridad referencial (perfiles sin usuario, assets/pagos huérfanos)
 *  - Duplicados (cédula, email, username)
 *  - Datos incompletos (perfiles solo con cédula)
 *  - Restos de prueba (carpetas de uploads sin expediente)
 *  - Diferencias entre Supabase (producción) y la BD local (antigua)
 *
 * Uso: node scripts/audit-data.mjs
 */
import { config as loadEnv } from "dotenv";
import { existsSync, readdirSync } from "node:fs";
import { Client } from "pg";
import { dbSslFor } from "../src/lib/db-ssl.mjs";

// Como el resto de scripts: los valores viven en `.env.local`. `dotenv/config` lee
// **solo** `.env`, asi que cualquier secreto que este alli llegaria vacio sin avisar.
// Es exactamente el fallo que dejo los respaldos sin cifrar.
loadEnv({ path: [".env.local", ".env"] });

const LOCAL_URL = process.env.LOCAL_DATABASE_URL ?? "postgresql://postgres:localdev@127.0.0.1:5432/sanmerida";
const REMOTE_URL = process.env.DATABASE_URL;

function makeClient(url) {
  return new Client({
    connectionString: url,
    // Hallazgo F: se valida el certificado (ver `src/lib/db-ssl.mjs`).
    ssl: dbSslFor(url),
    connectionTimeoutMillis: 20000,
  });
}

async function audit(label, url) {
  const client = makeClient(url);
  const report = { label, url: url.replace(/:[^:@]+@/, ":***@"), ok: false, problems: [] };

  try {
    await client.connect();
    const q = (sql) => client.query(sql);

    report.counts = (await q(`
      SELECT
        (SELECT count(*)::int FROM "User") AS users,
        (SELECT count(*)::int FROM "User" WHERE "isMember" = true) AS members,
        (SELECT count(*)::int FROM "MemberProfile") AS profiles,
        (SELECT count(*)::int FROM "MemberAsset") AS assets,
        (SELECT count(*)::int FROM "InstallmentPayment") AS cuotas,
        (SELECT count(*)::int FROM "AdvancePayment") AS abonos
    `)).rows[0];

    report.profiles = (await q(`
      SELECT p."cedula", p."nombre", p."apellido", p."email", p."username",
             (p."userId" IS NOT NULL) AS has_user,
             (SELECT count(*)::int FROM "MemberAsset" a WHERE a."profileId" = p."id") AS assets,
             (SELECT count(*)::int FROM "InstallmentPayment" i WHERE i."profileId" = p."id") AS cuotas
      FROM "MemberProfile" p
      ORDER BY p."createdAt" ASC
    `)).rows;

    const onlyCedula = report.profiles.filter((p) => !p.nombre && !p.apellido);
    if (onlyCedula.length) report.problems.push(`Perfiles SOLO con cédula: ${onlyCedula.map((p) => p.cedula).join(", ")}`);

    const withoutUser = report.profiles.filter((p) => !p.has_user);
    if (withoutUser.length) report.problems.push(`Perfiles SIN usuario: ${withoutUser.map((p) => p.cedula).join(", ")}`);

    const withoutAssets = report.profiles.filter((p) => p.assets === 0);
    if (withoutAssets.length) report.problems.push(`Perfiles SIN documentos: ${withoutAssets.map((p) => p.cedula).join(", ")}`);

    const dupCedula = (await q(`SELECT "cedula", count(*)::int AS n FROM "MemberProfile" GROUP BY "cedula" HAVING count(*) > 1`)).rows;
    if (dupCedula.length) report.problems.push(`Cédulas duplicadas: ${dupCedula.map((r) => `${r.cedula} (x${r.n})`).join(", ")}`);

    const dupEmail = (await q(`SELECT "email", count(*)::int AS n FROM "User" GROUP BY "email" HAVING count(*) > 1`)).rows;
    if (dupEmail.length) report.problems.push(`Emails duplicados: ${dupEmail.map((r) => r.email).join(", ")}`);

    const dupUser = (await q(`SELECT "username", count(*)::int AS n FROM "MemberProfile" WHERE "username" IS NOT NULL GROUP BY "username" HAVING count(*) > 1`)).rows;
    if (dupUser.length) report.problems.push(`Usernames duplicados: ${dupUser.map((r) => r.username).join(", ")}`);

    const orphanAssets = (await q(`SELECT count(*)::int AS n FROM "MemberAsset" a WHERE NOT EXISTS (SELECT 1 FROM "MemberProfile" p WHERE p."id" = a."profileId")`)).rows[0].n;
    if (orphanAssets > 0) report.problems.push(`Assets huérfanos: ${orphanAssets}`);

    const orphanCuotas = (await q(`SELECT count(*)::int AS n FROM "InstallmentPayment" i WHERE NOT EXISTS (SELECT 1 FROM "MemberProfile" p WHERE p."id" = i."profileId")`)).rows[0].n;
    if (orphanCuotas > 0) report.problems.push(`Cuotas huérfanas: ${orphanCuotas}`);

    const orphanProfilesUser = (await q(`SELECT count(*)::int AS n FROM "MemberProfile" p WHERE p."userId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."id" = p."userId")`)).rows[0].n;
    if (orphanProfilesUser > 0) report.problems.push(`Perfiles con userId inexistente: ${orphanProfilesUser}`);

    report.ok = true;
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
  } finally {
    await client.end().catch(() => undefined);
  }

  return report;
}

const local = await audit("LOCAL (BD antigua)", LOCAL_URL);
const remote = await audit("SUPABASE (PRODUCCION)", REMOTE_URL);

let uploadFolders = [];
try {
  if (existsSync("public/uploads/members")) {
    uploadFolders = readdirSync("public/uploads/members", { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  }
} catch {
  uploadFolders = [];
}

const remoteCedulas = new Set((remote.profiles ?? []).map((p) => p.cedula));
const orphanFolders = uploadFolders.filter((folder) => !remoteCedulas.has(folder));

const line = "=".repeat(64);
for (const report of [remote, local]) {
  console.log(line);
  console.log(`  ${report.label}`);
  console.log(`  ${report.url}`);
  console.log(line);
  if (report.error) {
    console.log(`  ERROR: ${report.error}`);
    console.log("");
    continue;
  }
  const c = report.counts;
  console.log(`  Usuarios: ${c.users} (miembros: ${c.members})`);
  console.log(`  Expedientes: ${c.profiles} | Documentos: ${c.assets} | Cuotas: ${c.cuotas} | Abonos: ${c.abonos}`);
  console.log("");
  console.log("  Expedientes:");
  for (const p of report.profiles) {
    console.log(
      `   - ${p.cedula} | ${p.nombre ?? "?"} ${p.apellido ?? "?"} | user=${p.has_user ? "SI" : "NO"} | docs=${p.assets} | cuotas=${p.cuotas} | ${p.email ?? "sin email"}`
    );
  }
  console.log("");
  if (report.problems.length) {
    console.log("  PROBLEMAS DETECTADOS:");
    for (const problem of report.problems) console.log(`   - ${problem}`);
  } else {
    console.log("  OK: sin problemas de integridad.");
  }
  console.log("");
}

console.log(line);
console.log("  CARPETAS DE UPLOADS SIN EXPEDIENTE (posibles restos)");
console.log(line);
console.log(`  Carpetas totales: ${uploadFolders.length} | Con expediente: ${uploadFolders.length - orphanFolders.length} | SIN expediente: ${orphanFolders.length}`);
if (orphanFolders.length) console.log(`   - ${orphanFolders.join(", ")}`);
console.log("");
