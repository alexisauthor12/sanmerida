/**
 * Revision de integridad: ¿estan todos los documentos donde deben?
 *
 * Compara las filas de `MemberAsset` con los objetos del bucket y avisa de:
 *  - DOCUMENTO FALTANTE: la base de datos lo referencia pero el archivo no esta.
 *  - HUERFANO: hay un archivo en el bucket que ninguna fila referencia.
 *  - TAMANO DISTINTO: el peso del archivo no coincide con el de la base de datos.
 *
 * Uso: node scripts/check-storage-integrity.mjs
 */
import { config as loadEnv } from "dotenv";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import {
  buildDerivedPdfKey,
  buildDerivedTextKey,
  normalizeStorageKey,
} from "../src/lib/asset-paths.mjs";
import { dbSslFor } from "../src/lib/db-ssl.mjs";

loadEnv({ path: [".env.local", ".env"] });

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "member-documents";

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.DATABASE_URL) {
  console.error("Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o DATABASE_URL.");
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function listRecursive(prefix = "") {
  const found = [];
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });

  if (error) throw new Error(`No se pudo listar el bucket: ${error.message}`);

  for (const entry of data ?? []) {
    const child = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.id === null) {
      found.push(...(await listRecursive(child)));
    } else {
      found.push({ key: child, size: entry.metadata?.size ?? 0 });
    }
  }

  return found;
}

const db = new Client({
  connectionString: process.env.DATABASE_URL,
  // Hallazgo F: se valida el certificado (ver `src/lib/db-ssl.mjs`).
  ssl: dbSslFor(process.env.DATABASE_URL),
  connectionTimeoutMillis: 20000,
});

await db.connect();

const { rows } = await db.query(
  `SELECT a."filePath", a."fileName", a."size", p."cedula"
     FROM "MemberAsset" a
     JOIN "MemberProfile" p ON p."id" = a."profileId"`,
);

const objects = await listRecursive();
const objectByKey = new Map(objects.map((object) => [object.key, object]));

const referenced = new Set();
const derived = new Set();
const missing = [];
const sizeMismatch = [];

for (const row of rows) {
  const key = normalizeStorageKey(row.filePath);
  referenced.add(key);

  // Los escaneos generan un PDF (y un .txt de OCR) con la misma clave base:
  // son archivos legitimos aunque no tengan fila propia en la base de datos.
  derived.add(buildDerivedPdfKey(key));
  derived.add(buildDerivedTextKey(key));

  const object = objectByKey.get(key);

  if (!object) {
    missing.push({ key, cedula: row.cedula, fileName: row.fileName });
    continue;
  }

  if (Number(row.size) > 0 && Number(object.size) > 0 && Number(row.size) !== Number(object.size)) {
    sizeMismatch.push({ key, db: Number(row.size), bucket: Number(object.size) });
  }
}

const orphans = objects.filter(
  (object) =>
    !referenced.has(object.key) &&
    !derived.has(object.key) &&
    !object.key.startsWith("_papelera/"),
);
const trashed = objects.filter((object) => object.key.startsWith("_papelera/"));

console.log("==================================================");
console.log(`Filas en base de datos : ${rows.length}`);
console.log(`Objetos en el bucket   : ${objects.length} (papelera: ${trashed.length})`);
console.log("--------------------------------------------------");
console.log(`Documentos FALTANTES   : ${missing.length}`);
for (const item of missing) {
  console.log(`  - cedula ${item.cedula}: ${item.key}`);
}
console.log(`Tamano distinto        : ${sizeMismatch.length}`);
for (const item of sizeMismatch) {
  console.log(`  - ${item.key}: BD=${item.db} bucket=${item.bucket}`);
}
console.log(`Huerfanos (sin fila)   : ${orphans.length}`);
for (const item of orphans) {
  console.log(`  - ${item.key}`);
}
console.log("==================================================");
console.log(missing.length === 0 ? "INTEGRIDAD OK" : "ATENCION: hay documentos faltantes");

await db.end().catch(() => undefined);
