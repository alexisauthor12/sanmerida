import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Los scripts tienen que leer `.env.local`, no solo `.env`.
 *
 * Nace de un fallo real y **silencioso**: `backup-users.mjs` usaba
 * `import "dotenv/config"`, que lee **unicamente** `.env`. La `BACKUP_PASSPHRASE` vive en
 * `.env.local` (donde la ponen los demas scripts), asi que llegaba vacia y **el respaldo
 * se escribia EN CLARO**, con un aviso que nadie miraba. El cifrado existia y no se
 * aplicaba nunca.
 *
 * `dotenv/config` no es un error de sintaxis ni nada que salte a la vista: simplemente lee
 * **otro archivo**. Por eso hace falta una prueba que lo vigile, y no confiar en
 * acordarse.
 *
 * El reparto actual de los archivos lo hace facil de olvidar:
 *   `.env`       -> DATABASE_URL, DIRECT_URL
 *   `.env.local` -> AUTH_SECRET, BACKUP_PASSPHRASE, SUPABASE_*, ADMIN_*
 *
 * Un script que solo lea `.env` funciona hoy (la base esta alli) y se rompe en silencio el
 * dia que algo se mueva al otro archivo.
 */

const RAIZ = process.cwd();
const SCRIPTS = join(RAIZ, "scripts");

/** Todos los `.mjs` de `scripts/`, como rutas relativas. */
function scripts() {
  return readdirSync(SCRIPTS)
    .filter((nombre) => nombre.endsWith(".mjs"))
    .map((nombre) => ({
      nombre,
      contenido: readFileSync(join(SCRIPTS, nombre), "utf8"),
    }));
}

test("la prueba encuentra los scripts del proyecto", () => {
  assert.ok(scripts().length >= 15, `Se encontraron ${scripts().length} scripts.`);
});

test("ningun script carga el entorno con `dotenv/config`", () => {
  const culpables = scripts()
    .filter(({ contenido }) =>
      /(^|\n)\s*import\s+["']dotenv\/config["']|require\(\s*["']dotenv\/config["']\s*\)/.test(
        contenido,
      ),
    )
    .map(({ nombre }) => `scripts/${nombre}`);

  assert.deepEqual(
    culpables,
    [],
    "Estos scripts usan `dotenv/config`, que NO lee `.env.local` y deja los secretos " +
      `vacios sin avisar:\n  ${culpables.join("\n  ")}\n` +
      'Cambialo por:  loadEnv({ path: [".env.local", ".env"] })',
  );
});

test("los scripts que cargan el entorno incluyen `.env.local`", () => {
  const sinEnvLocal = [];

  for (const { nombre, contenido } of scripts()) {
    // Solo los que cargan dotenv: los que no leen nada del entorno no aplican.
    if (!/loadEnv\s*\(/.test(contenido)) continue;

    if (!/loadEnv\(\s*\{\s*path:\s*\[[^\]]*"\.env\.local"/.test(contenido)) {
      sinEnvLocal.push(`scripts/${nombre}`);
    }
  }

  assert.deepEqual(
    sinEnvLocal,
    [],
    `Estos scripts cargan el entorno pero se saltan \`.env.local\`:\n  ${sinEnvLocal.join("\n  ")}`,
  );
});

test("la contrasena de los respaldos se lee del archivo donde vive", () => {
  // El caso concreto que origino esta prueba: si esto vuelve a pasar, los respaldos
  // salen sin cifrar y nadie se entera hasta que hay que restaurar.
  const backup = readFileSync(join(SCRIPTS, "backup-users.mjs"), "utf8");

  assert.match(
    backup,
    /loadEnv\(\s*\{\s*path:\s*\[[^\]]*"\.env\.local"/,
    "backup-users.mjs tiene que leer .env.local: BACKUP_PASSPHRASE vive ahi",
  );
  assert.match(backup, /BACKUP_PASSPHRASE/, "backup-users.mjs tiene que usar BACKUP_PASSPHRASE");
});
