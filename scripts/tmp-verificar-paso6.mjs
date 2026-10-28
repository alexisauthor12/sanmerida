/**
 * TEMPORAL: verificar el paso que fallo por el 503, sin pasar por el login.
 *
 * Se firman dos sesiones validas a mano (mismo algoritmo que `createSessionToken`):
 *   A) con `totpAt` reciente -> la licencia NO debe pedir codigo
 *   B) sin `totpAt`          -> la licencia SI debe pedirlo
 *
 * La cuenta tiene el 2FA activo en este momento (lo activo la prueba anterior).
 */
import { config as loadEnv } from "dotenv";
import { SignJWT } from "jose";
import { Client } from "pg";
import { dbSslFor } from "../src/lib/db-ssl.mjs";

loadEnv({ path: [".env.local", ".env"] });

const BASE = "https://sanmeridajz.com";
const EMAIL = "sanmeridaadmin@gmail.com";

const db = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: dbSslFor(process.env.DATABASE_URL),
});

await db.connect();

const { rows } = await db.query(
  `SELECT "id", "email", "nombre", "role", "tokenVersion", "totpEnabled"
     FROM "User" WHERE lower("email") = $1`,
  [EMAIL],
);

await db.end();

const usuario = rows[0];

console.log(`cuenta: ${usuario.email}  2FA activo: ${usuario.totpEnabled}`);
console.log(`tokenVersion: ${usuario.tokenVersion}\n`);

const secreto = new TextEncoder().encode(process.env.AUTH_SECRET);

async function firmarSesion(totpAt) {
  return new SignJWT({
    email: usuario.email,
    nombre: usuario.nombre,
    role: usuario.role,
    tv: usuario.tokenVersion,
    isMember: false,
    ...(totpAt ? { totpAt } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(usuario.id)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secreto);
}

async function probarLicencia(etiqueta, totpAt) {
  const token = await firmarSesion(totpAt);

  const r = await fetch(`${BASE}/api/auth/admin-license`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `san_team_session=${token}` },
    body: JSON.stringify({
      username: process.argv[2],
      license: process.argv[3],
    }),
  });

  const cuerpo = await r.json().catch(() => ({}));

  console.log(`${etiqueta}  ${r.status}  requiresTotp=${cuerpo.requiresTotp ?? false}`);

  return r.status;
}

console.log("Sesion A: con el segundo factor demostrado hace unos segundos");
const conMarca = await probarLicencia("  licencia sin codigo   ", Date.now());

console.log("\nSesion B: sin constancia del segundo factor (sesion vieja o robada)");
const sinMarca = await probarLicencia("  licencia sin codigo   ", 0);

console.log(
  `\n  A) NO vuelve a pedir el codigo: ${conMarca === 200 ? "OK <<<< el objetivo" : "FALLO"}`,
);
console.log(
  `  B) SI lo pide cuando no consta:  ${sinMarca === 401 ? "OK (proteccion intacta)" : "FALLO"}`,
);
