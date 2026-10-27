/**
 * Migra los expedientes locales de `public/uploads` al almacenamiento remoto
 * (Supabase Storage) y normaliza `MemberAsset.filePath`.
 *
 * Contexto: los documentos de los miembros se guardaban como archivos estaticos
 * dentro de `public/uploads`, lo que no funciona en Cloudflare Workers y ademas
 * dejaba los documentos personales versionados en Git. Ahora se guardan en un
 * bucket privado y se sirven por `/api/member-files/file` con sesion.
 *
 * Uso:
 *   node scripts/migrate-uploads-to-storage.mjs                        (simulacion, NO escribe)
 *   node scripts/migrate-uploads-to-storage.mjs --apply                (sube los archivos al bucket)
 *   node scripts/migrate-uploads-to-storage.mjs --apply --rewrite-paths
 *                                                                      (ademas normaliza filePath en la BD)
 *
 * Nota importante sobre `--rewrite-paths`: la aplicacion soporta los dos
 * formatos de ruta (con y sin slash inicial), por lo que el cambio en la BD NO
 * es obligatorio. Conviene aplicarlo solo despues de desplegar la version nueva
 * en Cloudflare, para no dejar sin imagenes a la version anterior.
 *
 * Requiere en el entorno: DATABASE_URL, SUPABASE_URL y
 * SUPABASE_SERVICE_ROLE_KEY (opcional SUPABASE_STORAGE_BUCKET).
 */
import { config as loadEnv } from "dotenv";
import { readFile } from "fs/promises";
import path from "path";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import {
  buildDerivedPdfKey,
  buildDerivedTextKey,
  normalizeStorageKey,
} from "../src/lib/asset-paths.mjs";

// Next carga .env.local ademas de .env; los scripts de node deben hacerlo igual.
loadEnv({ path: [".env.local", ".env"] });

const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "member-documents";
const APPLY = process.argv.includes("--apply");
const REWRITE_PATHS = process.argv.includes("--rewrite-paths");

if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL en el entorno.");
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (Supabase Storage).");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const db = new Client({
  connectionString: DATABASE_URL,
  // Hallazgo F: se valida el certificado (ver `src/lib/db-ssl.mjs`).
  ssl: dbSslFor(DATABASE_URL),
  connectionTimeoutMillis: 20000,
});

function localPathFromKey(key) {
  return path.join(process.cwd(), "public", ...normalizeStorageKey(key).split("/"));
}

async function uploadIfExists(key) {
  const safeKey = normalizeStorageKey(key);

  if (!safeKey) return "sin-clave";

  let bytes;

  try {
    bytes = await readFile(localPathFromKey(safeKey));
  } catch {
    return "no-existe";
  }

  if (!APPLY) return "simulado";

  const { error } = await supabase.storage.from(BUCKET).upload(safeKey, bytes, { upsert: true });

  return error ? `error: ${error.message}` : "subido";
}

try {
  await db.connect();
  console.log(`[modo  ] ${APPLY ? "APLICAR CAMBIOS" : "SIMULACION (sin escribir)"}`);
  console.log(`[bucket] ${BUCKET}`);

  const { rows } = await db.query(
    'SELECT "id", "filePath", "fileName", "assetType", "variant" FROM "MemberAsset" ORDER BY "createdAt"',
  );

  let uploaded = 0;
  let missing = 0;
  let rewritten = 0;
  let pendingRewrite = 0;

  for (const row of rows) {
    const key = normalizeStorageKey(row.filePath);
    const needsRewrite = key !== row.filePath;

    const mainResult = await uploadIfExists(key);
    if (mainResult === "subido") uploaded += 1;
    if (mainResult === "no-existe") {
      missing += 1;
      console.log(`[falta ] ${key} (no esta en public/uploads)`);
    }
    if (mainResult.startsWith("error")) {
      console.log(`[error ] ${key} -> ${mainResult}`);
    }

    // Los escaneos generan un PDF y (si hubo OCR) un .txt derivados que no
    // estan en la BD pero la interfaz enlaza directamente.
    if (row.variant === "SCANNED") {
      for (const derivedKey of [buildDerivedPdfKey(key), buildDerivedTextKey(key)]) {
        const derivedResult = await uploadIfExists(derivedKey);
        if (derivedResult === "subido") uploaded += 1;
        if (derivedResult === "no-existe") {
          missing += 1;
          console.log(`[falta ] ${derivedKey} (derivado del escaneo, no esta en public/uploads)`);
        }
        if (derivedResult.startsWith("error")) {
          console.log(`[error ] ${derivedKey} -> ${derivedResult}`);
        }
      }
    }

    if (needsRewrite && REWRITE_PATHS) {
      rewritten += 1;
      console.log(`[ruta  ] ${row.filePath} -> ${key}`);
      if (APPLY) {
        await db.query('UPDATE "MemberAsset" SET "filePath" = $1 WHERE "id" = $2', [key, row.id]);
      }
    } else if (needsRewrite) {
      pendingRewrite += 1;
    }
  }

  console.log("==================================================");
  console.log(`Archivos analizados : ${rows.length}`);
  console.log(`Archivos subidos    : ${uploaded}`);
  console.log(`Archivos faltantes  : ${missing} (no estaban en public/uploads)`);
  console.log(`Rutas normalizadas  : ${rewritten}`);
  console.log(`Rutas por normalizar: ${pendingRewrite} (usa --rewrite-paths tras desplegar)`);
  console.log(APPLY ? "ARCHIVOS SUBIDOS AL BUCKET" : "Simulacion: ejecuta con --apply para subir");
} catch (error) {
  console.error("[ERROR]", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await db.end().catch(() => undefined);
}
