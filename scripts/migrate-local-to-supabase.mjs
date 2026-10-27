/**
 * Migra los datos REALES de la base de datos local (Postgres local) a Supabase.
 *
 * Contexto: mientras `.env` apuntaba a la BD local, todos los registros nuevos
 * se guardaron ahí. Producción (Cloudflare) usa Supabase, que solo tenía datos
 * antiguos. Este script copia usuarios, expedientes, documentos y pagos.
 *
 * Uso:
 *   node scripts/migrate-local-to-supabase.mjs           (simulación, NO escribe)
 *   node scripts/migrate-local-to-supabase.mjs --apply   (aplica los cambios)
 */
import "dotenv/config";
import { Client } from "pg";
import { dbSslFor } from "../src/lib/db-ssl.mjs";

const LOCAL_URL =
  process.env.LOCAL_DATABASE_URL ??
  "postgresql://postgres:localdev@127.0.0.1:5432/sanmerida";
const REMOTE_URL = process.env.DATABASE_URL;
const APPLY = process.argv.includes("--apply");

if (!REMOTE_URL) {
  console.error("Falta DATABASE_URL (Supabase) en .env");
  process.exit(1);
}

const local = new Client({ connectionString: LOCAL_URL, connectionTimeoutMillis: 15000 });
const remote = new Client({
  connectionString: REMOTE_URL,
  // Hallazgo F: se valida el certificado (ver `src/lib/db-ssl.mjs`).
  ssl: dbSslFor(REMOTE_URL),
  connectionTimeoutMillis: 20000,
});

const log = (...args) => console.log(...args);

try {
  await local.connect();
  await remote.connect();
  log(`[modo] ${APPLY ? "APLICAR CAMBIOS" : "SIMULACION (sin escribir)"}`);
  log(`[local ] ${LOCAL_URL.replace(/:[^:@]+@/, ":***@")}`);
  log(`[remoto] ${REMOTE_URL.replace(/:[^:@]+@/, ":***@")}`);

  // ---------- USERS ----------
  const users = (await local.query('SELECT * FROM "User"')).rows;
  let usersCreated = 0;
  for (const user of users) {
    const found = await remote.query('SELECT "id" FROM "User" WHERE "email" = $1', [user.email]);
    if (found.rows[0]) continue;
    usersCreated += 1;
    log(`[user] + ${user.email} (${user.nombre} ${user.apellido})`);
    if (APPLY) {
      await remote.query(
        'INSERT INTO "User" ("id","nombre","apellido","email","telefono","passwordHash","isMember","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT ("email") DO NOTHING',
        [user.id, user.nombre, user.apellido, user.email, user.telefono, user.passwordHash, user.isMember, user.createdAt, user.updatedAt]
      );
    }
  }

  // ---------- PROFILES ----------
  const profiles = (await local.query('SELECT * FROM "MemberProfile"')).rows;
  const localUserEmailById = new Map(users.map((u) => [u.id, u.email]));
  let profilesCreated = 0;
  let profilesUpdated = 0;
  const profileIdMap = new Map();

  const columns = [
    "operationalGroup", "userId", "nombre", "apellido", "email", "telefono", "direccion",
    "ocupacion", "empresa", "username", "motoSlug", "motoMarca", "motoModelo", "motoImagen",
    "motoUnitPrice", "contractType", "planName", "termMonths", "monthlyAmount",
    "contractStartDate", "paymentMethod", "paymentBank", "paymentReference", "paymentAmount",
    "paymentDate", "references",
  ];

  for (const profile of profiles) {
    const existing = await remote.query(
      'SELECT "id","nombre","apellido","username" FROM "MemberProfile" WHERE "cedula" = $1',
      [profile.cedula]
    );
    const remoteRow = existing.rows[0];

    // Resolver userId contra Supabase (por email): los IDs locales no existen allí.
    let remoteUserId = null;
    if (profile.userId) {
      const email = localUserEmailById.get(profile.userId);
      if (email) {
        const userRow = await remote.query('SELECT "id" FROM "User" WHERE "email" = $1', [email]);
        remoteUserId = userRow.rows[0]?.id ?? null;
      }
    }
    const valueFor = (column) =>
      column === "userId" ? remoteUserId : column === "username" ? resolvedUsername : profile[column];

    // El username es único: si ya lo usa otra cédula, no lo sobreescribimos.
    let resolvedUsername = profile.username ?? null;
    if (resolvedUsername) {
      const owner = await remote.query('SELECT "id" FROM "MemberProfile" WHERE "username" = $1', [resolvedUsername]);
      const ownerRow = owner.rows[0];
      if (ownerRow && ownerRow.id !== remoteRow?.id) {
        log(`[perfil] ! username ${resolvedUsername} ya usado por otra cédula; se conserva el actual`);
        resolvedUsername = remoteRow?.username ?? null;
      }
    }

    if (!remoteRow) {
      profilesCreated += 1;
      log(`[perfil] + ${profile.cedula} ${profile.nombre} ${profile.apellido}`);
      if (APPLY) {
        const cols = ["id", "cedula", ...columns, "createdAt", "updatedAt"];
        const values = [profile.id, profile.cedula, ...columns.map((c) => valueFor(c)), profile.createdAt, profile.updatedAt];
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(",");
        const inserted = await remote.query(
          `INSERT INTO "MemberProfile" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${placeholders}) ON CONFLICT ("cedula") DO NOTHING RETURNING "id"`,
          values
        );
        profileIdMap.set(profile.id, inserted.rows[0]?.id ?? profile.id);
      } else {
        profileIdMap.set(profile.id, profile.id);
      }
    } else {
      profilesUpdated += 1;
      log(`[perfil] ~ ${profile.cedula} actualizar con: ${profile.nombre} ${profile.apellido}`);
      profileIdMap.set(profile.id, remoteRow.id);
      if (APPLY) {
        const sets = columns.map((c, i) => `"${c}" = $${i + 1}`).join(", ");
        await remote.query(
          `UPDATE "MemberProfile" SET ${sets}, "updatedAt" = $${columns.length + 1} WHERE "id" = $${columns.length + 2}`,
          [...columns.map((c) => valueFor(c)), profile.updatedAt, remoteRow.id]
        );
      }
    }
  }

  // ---------- DOCUMENTOS / CONTRATOS ----------
  const assets = (await local.query('SELECT * FROM "MemberAsset"')).rows;
  let assetsCreated = 0;
  for (const asset of assets) {
    const targetProfileId = profileIdMap.get(asset.profileId);
    if (!targetProfileId) continue;

    const found = await remote.query(
      'SELECT "id" FROM "MemberAsset" WHERE "profileId"=$1 AND "assetType"=$2 AND "documentKey"=$3 AND "variant"=$4',
      [targetProfileId, asset.assetType, asset.documentKey, asset.variant]
    );
    if (found.rows[0]) continue;

    assetsCreated += 1;
    if (APPLY) {
      await remote.query(
        'INSERT INTO "MemberAsset" ("id","profileId","assetType","documentKey","variant","filePath","fileName","mimeType","size","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING',
        [asset.id, targetProfileId, asset.assetType, asset.documentKey, asset.variant, asset.filePath, asset.fileName, asset.mimeType, asset.size, asset.createdAt]
      );
    }
  }

  // ---------- PAGOS DE CUOTAS ----------
  const payments = (await local.query('SELECT * FROM "InstallmentPayment"')).rows;
  let paymentsCreated = 0;
  for (const payment of payments) {
    const targetProfileId = profileIdMap.get(payment.profileId);
    if (!targetProfileId) continue;

    const found = await remote.query(
      'SELECT "id" FROM "InstallmentPayment" WHERE "profileId"=$1 AND "installmentNumber"=$2 AND "reference"=$3',
      [targetProfileId, payment.installmentNumber, payment.reference]
    );
    if (found.rows[0]) continue;

    paymentsCreated += 1;
    if (APPLY) {
      await remote.query(
        'INSERT INTO "InstallmentPayment" ("id","profileId","installmentNumber","amount","paymentDate","reference","bank","method","note","createdByUserId","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING',
        [payment.id, targetProfileId, payment.installmentNumber, payment.amount, payment.paymentDate, payment.reference, payment.bank, payment.method, payment.note, payment.createdByUserId, payment.createdAt]
      );
    }
  }

  // ---------- ABONOS ----------
  const advances = (await local.query('SELECT * FROM "AdvancePayment"')).rows;
  let advancesCreated = 0;
  for (const advance of advances) {
    const targetProfileId = profileIdMap.get(advance.profileId);
    if (!targetProfileId) continue;

    const found = await remote.query(
      'SELECT "id" FROM "AdvancePayment" WHERE "profileId"=$1 AND "reference"=$2',
      [targetProfileId, advance.reference]
    );
    if (found.rows[0]) continue;

    advancesCreated += 1;
    if (APPLY) {
      await remote.query(
        'INSERT INTO "AdvancePayment" ("id","profileId","amount","paymentDate","reference","bank","method","note","createdByUserId","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING',
        [advance.id, targetProfileId, advance.amount, advance.paymentDate, advance.reference, advance.bank, advance.method, advance.note, advance.createdByUserId, advance.createdAt]
      );
    }
  }

  log("==================================================");
  log(`Usuarios nuevos      : ${usersCreated}`);
  log(`Perfiles nuevos      : ${profilesCreated}`);
  log(`Perfiles actualizados: ${profilesUpdated}`);
  log(`Documentos nuevos    : ${assetsCreated}`);
  log(`Cuotas nuevas        : ${paymentsCreated}`);
  log(`Abonos nuevos        : ${advancesCreated}`);
  log(APPLY ? "CAMBIOS APLICADOS" : "Simulacion: ejecuta con --apply para aplicar");
} catch (error) {
  console.error("[ERROR]", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await local.end().catch(() => undefined);
  await remote.end().catch(() => undefined);
}
