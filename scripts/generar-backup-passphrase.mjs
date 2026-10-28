/**
 * Genera y publica `BACKUP_PASSPHRASE`, la contrasena que cifra los respaldos
 * (`docs/OPERACIONES_PRODUCCION.md` 8.1).
 *
 * Sin ella, los respaldos se guardan **en claro**: contienen el `passwordHash` de todas
 * las cuentas, cedulas, telefonos, direcciones y los documentos de los expedientes.
 * Guardarlos asi en un disco externo o en la nube es trasladar el riesgo de la base de
 * datos a un pendrive.
 *
 * Uso:
 *   node scripts/generar-backup-passphrase.mjs            (simulacro)
 *   node scripts/generar-backup-passphrase.mjs --apply    (la escribe)
 *
 * **Si se pierde, los respaldos cifrados con ella no se pueden abrir. Nunca.** No hay
 * recuperacion posible: guardala en un gestor de contrasenas y, si cambias de
 * contrasena, **conserva la anterior**: los respaldos viejos se descifran con la de su
 * fecha.
 *
 * Se genera en hexadecimal (0-9 y a-f) para que no lleve `$` ni comillas, que son lo que
 * se rompe en `.env.local` con `dotenv-expand`.
 */
import { config as loadEnv } from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

loadEnv({ path: [".env.local", ".env"] });

const APLICAR = process.argv.includes("--apply");
const CLAVE = "BACKUP_PASSPHRASE";

// 40 caracteres hexadecimales = 160 bits de entropia. De sobra.
const bytes = crypto.getRandomValues(new Uint8Array(20));
const PASSPHRASE = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const actual = String(process.env[CLAVE] ?? "").trim();

console.log("\n" + "=".repeat(64));
console.log(APLICAR ? "  CONTRASENA DE RESPALDO" : "  SIMULACRO (nada escrito)");
console.log("=".repeat(64));
console.log(`  ${CLAVE}:`);
console.log(`  ${PASSPHRASE}`);
console.log("=".repeat(64));
console.log("  GUARDALA AHORA en tu gestor de contrasenas.");
console.log("  Si la pierdes, los respaldos cifrados NO se pueden abrir. Nunca.");
console.log("=".repeat(64) + "\n");

if (actual) {
  console.warn(
    `Aviso: ya habia una ${CLAVE} definida. Si la cambias, **conserva la anterior**:\n` +
      "los respaldos que ya existen se descifran con la que estaba puesta el dia que se\n" +
      "hicieron.\n",
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
    ? contenido.replace(patron, `${CLAVE}=${PASSPHRASE}`)
    : `${contenido.trimEnd()}\n${CLAVE}=${PASSPHRASE}\n`;

  writeFileSync(archivo, contenido, "utf8");
  console.log(`Actualizado: ${archivo}`);
}

console.log(
  "\nListo. El proximo `node scripts/backup-users.mjs` ya saldra cifrado.\n" +
    "Comprueba que se puede abrir:  node scripts/restore-backup.mjs --verificar <archivo>\n",
);
