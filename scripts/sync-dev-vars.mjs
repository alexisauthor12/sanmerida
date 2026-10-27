/**
 * Sincroniza `.dev.vars` con las variables que necesita el preview de Cloudflare.
 *
 * `.dev.vars` (ignorado por Git) es el entorno del Worker local
 * (`npm run preview:cf`). Si le falta `AUTH_SECRET`, el preview firma sesiones con
 * un valor inexistente y todo falla; si le falta la service role key, los
 * documentos se leen del disco en vez del bucket.
 *
 * Copia desde `.env.local` las claves que falten, SIN imprimir sus valores.
 *
 * Uso:
 *   node scripts/sync-dev-vars.mjs            (simulacion)
 *   node scripts/sync-dev-vars.mjs --apply    (escribe)
 */
import { readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";

const apply = process.argv.includes("--apply");

/** Variables que el Worker local necesita para comportarse como produccion. */
const REQUERIDAS = [
  "AUTH_SECRET",
  "ADMIN_USERNAME",
  "ADMIN_ACCOUNT_EMAIL",
  "ADMIN_LICENSE_HASH",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "DIRECT_URL",
];

const ORIGEN = path.resolve(process.cwd(), ".env.local");
const DESTINO = path.resolve(process.cwd(), ".dev.vars");

function leerClaves(contenido) {
  const mapa = new Map();

  for (const linea of contenido.split(/\r?\n/)) {
    const limpia = linea.trim();

    if (!limpia || limpia.startsWith("#")) continue;

    const corte = limpia.indexOf("=");

    if (corte <= 0) continue;

    mapa.set(limpia.slice(0, corte).trim(), limpia.slice(corte + 1).trim());
  }

  return mapa;
}

async function existe(archivo) {
  try {
    await access(archivo);
    return true;
  } catch {
    return false;
  }
}

const origen = leerClaves(await readFile(ORIGEN, "utf8").catch(() => ""));
const destinoExiste = await existe(DESTINO);
const destino = leerClaves(destinoExiste ? await readFile(DESTINO, "utf8") : "");

const faltantes = REQUERIDAS.filter((clave) => !destino.has(clave) && origen.has(clave));
const sinOrigen = REQUERIDAS.filter((clave) => !destino.has(clave) && !origen.has(clave));

console.log(`Origen:  .env.local (${origen.size} claves)`);
console.log(`Destino: .dev.vars ${destinoExiste ? `(${destino.size} claves)` : "(no existe, se creara)"}`);

if (faltantes.length === 0 && sinOrigen.length === 0) {
  console.log("\nNada que hacer: .dev.vars ya tiene todo lo necesario.");
  process.exit(0);
}

if (faltantes.length > 0) {
  console.log(`\nSe agregaran ${faltantes.length} clave(s) (valores no mostrados):`);

  for (const clave of faltantes) {
    console.log(`  + ${clave}`);
  }
}

if (sinOrigen.length > 0) {
  console.log(`\nNo estan en .env.local (agrega manualmente si hacen falta):`);

  for (const clave of sinOrigen) {
    console.log(`  ! ${clave}`);
  }
}

if (!apply) {
  console.log("\nSimulacion: no se escribio nada. Ejecuta con --apply para aplicar.");
  process.exit(0);
}

const nuevas = faltantes.map((clave) => `${clave}=${origen.get(clave)}`);

if (nuevas.length > 0) {
  const contenidoActual = destinoExiste ? await readFile(DESTINO, "utf8") : "";
  const separador = contenidoActual && !contenidoActual.endsWith("\n") ? "\n" : "";

  await writeFile(DESTINO, `${contenidoActual}${separador}${nuevas.join("\n")}\n`, "utf8");

  console.log(`\n.dev.vars actualizado con ${nuevas.length} clave(s).`);
}
