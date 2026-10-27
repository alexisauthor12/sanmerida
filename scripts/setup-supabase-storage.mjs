/**
 * Prepara el almacenamiento de expedientes en Supabase Storage.
 *
 *  - Crea el bucket privado si no existe (idempotente).
 *  - Verifica que el bucket quede como privado.
 *
 * Usa la API oficial de Storage cuando hay `SUPABASE_URL` +
 * `SUPABASE_SERVICE_ROLE_KEY`. Si no hay service role key pero si `DATABASE_URL`,
 * crea la fila del bucket directamente en `storage.buckets` (es lo mismo que hace
 * la API internamente), avisando que las subidas siguen necesitando la key.
 *
 * Uso:
 *   node scripts/setup-supabase-storage.mjs
 */
import { config as loadEnv } from "dotenv";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import {
  ALLOWED_ASSET_MIME_TYPES,
  MAX_ASSET_UPLOAD_BYTES,
} from "../src/lib/asset-paths.mjs";

// Next carga .env.local ademas de .env; los scripts de node deben hacerlo igual.
loadEnv({ path: [".env.local", ".env"] });

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "member-documents";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const DATABASE_URL = process.env.DATABASE_URL || "";

async function ensureWithApi() {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: buckets, error } = await supabase.storage.listBuckets();

  if (error) {
    throw new Error(`No se pudieron listar los buckets: ${error.message}`);
  }

  const exists = (buckets ?? []).some((bucket) => bucket.name === BUCKET || bucket.id === BUCKET);

  if (!exists) {
    const { error: createError } = await supabase.storage.createBucket(BUCKET, { public: false });

    if (createError) {
      throw new Error(`No se pudo crear el bucket: ${createError.message}`);
    }

    console.log(`[api] bucket "${BUCKET}" creado (privado).`);
  } else {
    console.log(`[api] bucket "${BUCKET}" ya existia.`);
  }

  const { data: after } = await supabase.storage.listBuckets();
  const bucket = (after ?? []).find((item) => item.name === BUCKET || item.id === BUCKET);

  if (bucket && bucket.public) {
    console.warn(`[aviso] el bucket "${BUCKET}" es PUBLICO. Debe ser privado.`);
  } else {
    console.log(`[api] bucket "${BUCKET}" verificado como privado.`);
  }

  // Blindaje a nivel de almacenamiento: aunque la app tuviera un fallo, Supabase
  // rechaza tipos no permitidos y archivos por encima del limite.
  const { error: updateError } = await supabase.storage.updateBucket(BUCKET, {
    public: false,
    fileSizeLimit: MAX_ASSET_UPLOAD_BYTES,
    allowedMimeTypes: ALLOWED_ASSET_MIME_TYPES,
  });

  if (updateError) {
    console.warn(`[aviso] no se pudieron aplicar los limites al bucket: ${updateError.message}`);
  } else {
    console.log(
      `[api] limites aplicados: ${Math.round(MAX_ASSET_UPLOAD_BYTES / 1024 / 1024)} MB y ${ALLOWED_ASSET_MIME_TYPES.length} tipos permitidos.`,
    );
  }
}

async function ensureWithSql() {
  const client = new Client({
    connectionString: DATABASE_URL,
    // Hallazgo F: se valida el certificado (ver `src/lib/db-ssl.mjs`).
    ssl: dbSslFor(DATABASE_URL),
    connectionTimeoutMillis: 15000,
  });

  await client.connect();

  try {
    const existing = await client.query("SELECT id, name, public FROM storage.buckets WHERE id = $1", [BUCKET]);

    if (existing.rows.length === 0) {
      await client.query("INSERT INTO storage.buckets (id, name, public) VALUES ($1, $2, false)", [BUCKET, BUCKET]);
      console.log(`[sql] bucket "${BUCKET}" creado (privado).`);
    } else {
      if (existing.rows[0].public) {
        await client.query("UPDATE storage.buckets SET public = false WHERE id = $1", [BUCKET]);
        console.log(`[sql] bucket "${BUCKET}" existia como publico: corregido a privado.`);
      } else {
        console.log(`[sql] bucket "${BUCKET}" ya existia y es privado.`);
      }
    }

    // Blindaje a nivel de almacenamiento (tamano y tipos permitidos).
    await client.query(
      "UPDATE storage.buckets SET file_size_limit = $2, allowed_mime_types = $3 WHERE id = $1",
      [BUCKET, MAX_ASSET_UPLOAD_BYTES, ALLOWED_ASSET_MIME_TYPES],
    );
    console.log(`[sql] limites aplicados: ${Math.round(MAX_ASSET_UPLOAD_BYTES / 1024 / 1024)} MB y ${ALLOWED_ASSET_MIME_TYPES.length} tipos.`);

    const check = await client.query("SELECT id, name, public FROM storage.buckets ORDER BY name");
    console.log("[sql] buckets actuales:");
    for (const row of check.rows) {
      console.log(`  - ${row.name} | public=${row.public}`);
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

try {
  if (SUPABASE_URL && SERVICE_ROLE_KEY) {
    await ensureWithApi();
  } else if (DATABASE_URL) {
    console.log("[modo] sin SUPABASE_SERVICE_ROLE_KEY: se usa DATABASE_URL para crear el bucket.");
    await ensureWithSql();
    console.log("[pendiente] para subir archivos falta SUPABASE_SERVICE_ROLE_KEY.");
  } else {
    console.error("Faltan credenciales: define SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (o DATABASE_URL).");
    process.exitCode = 1;
  }
} catch (error) {
  console.error("[ERROR]", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
