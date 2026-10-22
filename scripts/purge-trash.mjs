/**
 * Purga de la papelera: borra DEFINITIVAMENTE los documentos que se eliminaron
 * hace mas de N dias (por defecto 30). Antes de eso siguen recuperables en
 * `_papelera/<fecha>/...`.
 *
 * Uso:
 *   node scripts/purge-trash.mjs              (simulacion: solo lista)
 *   node scripts/purge-trash.mjs --apply      (borra de verdad)
 *   node scripts/purge-trash.mjs --apply 60   (conserva 60 dias)
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: [".env.local", ".env"] });

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "member-documents";
const APPLY = process.argv.includes("--apply");
const daysArg = process.argv.find((value) => /^[0-9]+$/.test(value));
const KEEP_DAYS = daysArg ? Number(daysArg) : 30;

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function listRecursive(prefix = "") {
  const found = [];
  const { data } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });

  for (const entry of data ?? []) {
    const child = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.id === null) {
      found.push(...(await listRecursive(child)));
    } else {
      found.push(child);
    }
  }

  return found;
}

const limit = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
const objects = await listRecursive("_papelera");

const toPurge = objects.filter((key) => {
  const day = key.split("/")[1] ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day < limit;
});

console.log(`[papelera] objetos totales: ${objects.length}`);
console.log(`[papelera] a borrar (anteriores a ${limit}): ${toPurge.length}`);

for (const key of toPurge) {
  console.log(`  - ${key}`);
}

if (!APPLY) {
  console.log("Simulacion: ejecuta con --apply para borrar de verdad.");
  process.exit(0);
}

if (toPurge.length > 0) {
  const { error } = await supabase.storage.from(BUCKET).remove(toPurge);
  console.log(error ? `[error] ${error.message}` : `[papelera] ${toPurge.length} objetos borrados definitivamente`);
}

const after = await listRecursive("_papelera");
console.log(`[papelera] objetos restantes: ${after.length}`);
