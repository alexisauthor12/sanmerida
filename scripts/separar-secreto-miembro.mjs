/**
 * Separa el secreto que cifra los datos de los miembros de `AUTH_SECRET`
 * (`docs/SEGURIDAD_INTEGRAL.md` 13.7).
 *
 * ## Por que hay que hacerlo
 *
 * `AUTH_SECRET` sirve hoy para **tres** cosas: firmar las sesiones, cifrar las
 * credenciales de miembro (`SAN-MEMBER-XXXXXX`) y cifrar los campos personales
 * (direccion, referencias y los tres pines de ubicacion, seccion 9.6). Eso tiene dos
 * consecuencias malas:
 *
 *  1. Filtrar `AUTH_SECRET` no solo permite falsificar sesiones: expone **todos** esos datos.
 *  2. **Rotar `AUTH_SECRET` deja ilegibles las direcciones y las coordenadas.** Para
 *     siempre: el respaldo tambien las tiene cifradas con esa clave.
 *
 * Este script genera el secreto propio y lo deja publicado. Despues hay que recifrar lo
 * que ya existe con los dos scripts de rotacion.
 *
 * ## Uso
 *
 *   node scripts/separar-secreto-miembro.mjs            (simulacro: muestra el secreto)
 *   node scripts/separar-secreto-miembro.mjs --apply    (lo escribe y publica)
 *
 * Al aplicar deja pendientes **dos** rotaciones, y las dos hay que ejecutarlas:
 *
 *   node scripts/rotate-member-key-secret.mjs --apply     (credenciales de miembro)
 *   node scripts/encrypt-member-pii.mjs --recifrar --apply (campos personales)
 *
 * El secreto se genera **en hexadecimal**: 64 caracteres de 0-9 y a-f. Asi no lleva `$`
 * ni comillas, que son justo lo que se rompe en `.env.local` con `dotenv-expand`.
 */
import { config as loadEnv } from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

loadEnv({ path: [".env.local", ".env"] });

const APLICAR = process.argv.includes("--apply");
const CLAVE = "MEMBER_KEY_ENCRYPTION_SECRET";

const bytes = crypto.getRandomValues(new Uint8Array(32));
const SECRETO = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const actual = String(process.env[CLAVE] ?? "").trim();

console.log("\n" + "=".repeat(64));
console.log(APLICAR ? "  SEPARANDO EL SECRETO DE LOS DATOS DE MIEMBRO" : "  SIMULACRO (nada escrito)");
console.log("=".repeat(64));
console.log(`  ${CLAVE}:`);
console.log(`  ${SECRETO}`);
console.log("=".repeat(64));
console.log("  Guardalo en tu gestor de contrasenas. Sin el, las direcciones,");
console.log("  las referencias y las coordenadas NO se pueden recuperar.");
console.log("=".repeat(64) + "\n");

if (actual) {
  console.warn(
    `Aviso: ya habia un ${CLAVE} definido. Si lo cambias por este, las filas que esten\n` +
      "cifradas con el anterior seguiran abriendose con el heredado (AUTH_SECRET) solo si\n" +
      "aquel era el heredado. Repasa antes la seccion 9.13 del documento de operaciones.\n",
  );
}

if (!APLICAR) {
  console.log("Simulacro: nada escrito. Repite con --apply.\n");
  process.exit(0);
}

for (const archivo of [".env.local", ".dev.vars"]) {
  if (!existsSync(archivo)) {
    console.warn(`(omitido) ${archivo} no existe`);
    continue;
  }

  let contenido = readFileSync(archivo, "utf8");
  const patron = new RegExp(`^${CLAVE}=.*$`, "m");

  contenido = patron.test(contenido)
    ? contenido.replace(patron, `${CLAVE}=${SECRETO}`)
    : `${contenido.trimEnd()}\n${CLAVE}=${SECRETO}\n`;

  writeFileSync(archivo, contenido, "utf8");
  console.log(`Actualizado: ${archivo}`);
}

writeFileSync("tmp-secreto-miembro.json", JSON.stringify({ [CLAVE]: SECRETO }), "utf8");

console.log("\n" + "=".repeat(64));
console.log("  FALTA PUBLICARLO EN EL WORKER");
console.log("=".repeat(64));
console.log("  npx wrangler secret bulk tmp-secreto-miembro.json");
console.log("  Remove-Item tmp-secreto-miembro.json");
console.log("");
console.log("  Y DESPUES, LAS DOS ROTACIONES (en este orden):");
console.log("  node scripts/rotate-member-key-secret.mjs --apply");
console.log("  node scripts/encrypt-member-pii.mjs --recifrar --apply");
console.log("=".repeat(64) + "\n");
