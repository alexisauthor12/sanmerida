/**
 * Crea (o restablece) la cuenta de administrador y sus credenciales.
 *
 * Deja lista la entrada completa, que son **dos pasos**:
 *
 *   1. Correo + contrasena  -> sesion normal en `/api/auth/login`
 *   2. Usuario + licencia   -> step-up en `/api/auth/admin-license`
 *
 * Uso:
 *   node scripts/crear-admin.mjs                       (simulacro: genera y muestra)
 *   node scripts/crear-admin.mjs --apply               (aplica de verdad)
 *   node scripts/crear-admin.mjs --apply --email otro@correo.com
 *
 * Al aplicar:
 *  - crea o actualiza el `User` con rol ADMIN (bcrypt coste 12);
 *  - cierra todas sus sesiones (`tokenVersion++`) y limpia bloqueos;
 *  - deja el segundo factor **desactivado** para poder entrar la primera vez
 *    (hay que activarlo despues desde el panel, en Seguridad);
 *  - escribe `ADMIN_ACCOUNT_EMAIL`, `ADMIN_USERNAME` y `ADMIN_LICENSE_HASH` en
 *    `.env.local` y `.dev.vars`, y deja un JSON para publicarlos en el Worker.
 *
 * La licencia **no se puede recuperar** del hash: guardala donde guardes la contrasena.
 */
import { config as loadEnv } from "dotenv";
import bcrypt from "bcryptjs";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Client } from "pg";
import { validatePassword } from "../src/lib/password-policy.mjs";
import { dbSslFor } from "../src/lib/db-ssl.mjs";

loadEnv({ path: [".env.local", ".env"] });

const APLICAR = process.argv.includes("--apply");

const indiceEmail = process.argv.indexOf("--email");
const EMAIL = (indiceEmail > -1 ? process.argv[indiceEmail + 1] : "sanmeridaadmin@gmail.com")
  .trim()
  .toLowerCase();

const USUARIO_ADMIN = (process.env.ADMIN_USERNAME ?? "san-root-x9").trim();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Generacion de credenciales
// ---------------------------------------------------------------------------

/** Alfabeto sin caracteres ambiguos (0/O, 1/l/I) para poder dictarlos por telefono. */
const SIN_AMBIGUOS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function aleatorio(alfabeto, longitud) {
  const bytes = crypto.getRandomValues(new Uint8Array(longitud));
  let salida = "";

  for (const byte of bytes) salida += alfabeto[byte % alfabeto.length];

  return salida;
}

/** Contrasena que cumple la politica del proyecto (`password-policy.mjs`). */
function generarContrasena() {
  for (let intento = 0; intento < 50; intento += 1) {
    // Se garantizan los cuatro tipos y se revuelve, para que cumpla siempre.
    const candidata = `${aleatorio(SIN_AMBIGUOS, 14)}Aa7!`;
    const revuelta = candidata
      .split("")
      .sort(() => (crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0 ? 1 : -1))
      .join("");

    if (validatePassword(revuelta, { nombre: "Admin", apellido: "San Merida", email: EMAIL }).ok) {
      return revuelta;
    }
  }

  throw new Error("No se pudo generar una contrasena valida.");
}

const CONTRASENA = generarContrasena();
const LICENCIA = `SAN-ADMIN-${aleatorio(SIN_AMBIGUOS, 20)}`;

console.log("\n" + "=".repeat(64));
console.log(APLICAR ? "  CREANDO CREDENCIALES DE ADMINISTRADOR" : "  SIMULACRO (nada escrito)");
console.log("=".repeat(64));
console.log(`  Correo            : ${EMAIL}`);
console.log(`  Contrasena        : ${CONTRASENA}`);
console.log(`  Usuario admin     : ${USUARIO_ADMIN}`);
console.log(`  Licencia          : ${LICENCIA}`);
console.log("=".repeat(64));
console.log("  La licencia NO se puede recuperar del hash. Guardala ya.");
console.log("=".repeat(64) + "\n");

if (!APLICAR) {
  console.log("Simulacro: nada escrito. Repite con --apply.\n");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 1. La cuenta en la base de datos
// ---------------------------------------------------------------------------

const passwordHash = await bcrypt.hash(CONTRASENA, 12);

const db = new Client({
  connectionString: DATABASE_URL,
  ssl: dbSslFor(DATABASE_URL),
  connectionTimeoutMillis: 20000,
});

await db.connect();

try {
  // `ON CONFLICT` sobre el correo: si ya existia, se restablece en vez de duplicar.
  // Sube `tokenVersion` a proposito: cualquier sesion anterior de esa cuenta queda
  // cerrada, que es justo lo que se quiere al cambiar una contrasena.
  const { rows } = await db.query(
    `INSERT INTO "User"
       ("id", "nombre", "apellido", "email", "telefono", "passwordHash", "role", "isMember",
        "tokenVersion", "failedLoginCount", "totpEnabled", "totpSecret", "createdAt", "updatedAt")
     VALUES
       (gen_random_uuid()::text, 'Administrador', 'SAN Merida', $1, '0000000000', $2, 'ADMIN', false,
        1, 0, false, NULL, now(), now())
     ON CONFLICT ("email") DO UPDATE SET
       "passwordHash"      = EXCLUDED."passwordHash",
       "role"              = 'ADMIN',
       "isMember"          = false,
       "tokenVersion"      = "User"."tokenVersion" + 1,
       "failedLoginCount"  = 0,
       "lockedUntil"       = NULL,
       "totpEnabled"       = false,
       "totpSecret"        = NULL,
       "updatedAt"         = now()
     RETURNING "id", "email", "role", "tokenVersion"`,
    [EMAIL, passwordHash],
  );

  const fila = rows[0];

  console.log(`Cuenta lista: ${fila.email}  rol=${fila.role}  tokenVersion=${fila.tokenVersion}`);
  console.log("(tokenVersion sube: cualquier sesion anterior de esa cuenta queda cerrada)\n");
} finally {
  await db.end().catch(() => undefined);
}

// ---------------------------------------------------------------------------
// 2. Los datos en el entorno local
// ---------------------------------------------------------------------------

const licenseHash = bcrypt.hashSync(LICENCIA, 12);

const VALORES = {
  ADMIN_ACCOUNT_EMAIL: EMAIL,
  ADMIN_USERNAME: USUARIO_ADMIN,
  ADMIN_LICENSE_HASH: licenseHash,
};

for (const archivo of [".env.local", ".dev.vars"]) {
  if (!existsSync(archivo)) {
    console.warn(`(omitido) ${archivo} no existe`);
    continue;
  }

  // En `.env.local` los `$` del hash bcrypt van **escapados**: Next pasa los valores
  // por `dotenv-expand`, que siempre intenta interpretarlos. Sin el escape, `$2b` se
  // lee como una variable llamada `2b` (que no existe) y el hash llega vacio al
  // servidor. En `.dev.vars` no se escapa: lo lee wrangler, que no expande.
  const escapar = archivo === ".env.local";

  let contenido = readFileSync(archivo, "utf8");

  for (const [clave, valor] of Object.entries(VALORES)) {
    const escrito = escapar ? valor.replace(/\$/g, "\\$") : valor;
    const patron = new RegExp(`^${clave}=.*$`, "m");

    contenido = patron.test(contenido)
      ? contenido.replace(patron, `${clave}=${escrito}`)
      : `${contenido.trimEnd()}\n${clave}=${escrito}\n`;
  }

  writeFileSync(archivo, contenido, "utf8");
  console.log(`Actualizado: ${archivo}`);
}

// ---------------------------------------------------------------------------
// 3. Los secretos del Worker
// ---------------------------------------------------------------------------

// Se usa un JSON y no stdin porque `wrangler secret bulk` no tiene ambiguedad con
// los saltos de linea finales: el valor va byte a byte.
writeFileSync("tmp-secretos-admin.json", JSON.stringify(VALORES), "utf8");

console.log("\n" + "=".repeat(64));
console.log("  FALTA PUBLICAR LOS SECRETOS EN EL WORKER");
console.log("=".repeat(64));
console.log("  npx wrangler secret bulk tmp-secretos-admin.json");
console.log("  Remove-Item tmp-secretos-admin.json    (contiene el hash; no lo dejes)");
console.log("=".repeat(64) + "\n");
