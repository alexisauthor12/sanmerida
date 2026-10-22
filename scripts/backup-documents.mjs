/**
 * Respaldo de los documentos de los expedientes.
 *
 * Descarga TODOS los objetos del bucket a una carpeta local (con su hash
 * SHA-256) y guarda un manifiesto con las filas de la base de datos, para poder
 * reconstruir los expedientes si algo se perdiera.
 *
 * Uso:
 *   node scripts/backup-documents.mjs                  (carpeta con fecha)
 *   node scripts/backup-documents.mjs D:\respaldos\san (carpeta concreta)
 *
 * Recomendacion: ejecutarlo cada semana y guardar la carpeta en la nube
 * (Drive/OneDrive) o en un disco externo. `backups/` esta ignorado por Git.
 */
import { config as loadEnv } from "dotenv";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { createHash } from "node:crypto";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: [".env.local", ".env"] });

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "member-documents";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const targetDir = process.argv[2] ?? path.join("backups", "documents", stamp);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
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

const objects = await listRecursive();
console.log(`[backup] objetos en el bucket: ${objects.length}`);

await mkdir(targetDir, { recursive: true });

const manifestObjects = [];
let totalBytes = 0;
let failed = 0;

for (const object of objects) {
  const { data, error } = await supabase.storage.from(BUCKET).download(object.key);

  if (error || !data) {
    console.error(`[backup] FALLO al descargar ${object.key}: ${error?.message ?? "sin datos"}`);
    failed += 1;
    continue;
  }

  const bytes = Buffer.from(await data.arrayBuffer());
  const filePath = path.join(targetDir, ...object.key.split("/"));

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, bytes);

  manifestObjects.push({
    key: object.key,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });

  totalBytes += bytes.length;
}

console.log(`[backup] archivos guardados: ${manifestObjects.length} (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`);
if (failed > 0) console.warn(`[backup] archivos con error: ${failed}`);

let database = [];

if (DATABASE_URL) {
  const db = new Client({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes("localhost") || DATABASE_URL.includes("127.0.0.1")
      ? undefined
      : { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });

  try {
    await db.connect();
    const { rows } = await db.query(
      `SELECT a."assetType", a."documentKey", a."variant", a."filePath", a."fileName", a."mimeType", a."size",
              p."cedula", p."nombre", p."apellido", p."username"
         FROM "MemberAsset" a
         JOIN "MemberProfile" p ON p."id" = a."profileId"
        ORDER BY p."cedula", a."assetType", a."documentKey"`,
    );
    database = rows;
    console.log(`[backup] filas de expedientes incluidas en el manifiesto: ${rows.length}`);
  } catch (error) {
    console.warn(`[backup] no se pudo leer la base de datos: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await db.end().catch(() => undefined);
  }
}

await writeFile(
  path.join(targetDir, "manifest.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      bucket: BUCKET,
      objects: manifestObjects,
      database,
    },
    null,
    2,
  ),
);

console.log(`[backup] manifiesto: ${path.join(targetDir, "manifest.json")}`);
console.log("[backup] LISTO");
