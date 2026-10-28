/**
 * Elimina una cuenta de usuario dejando claro que NO se borra con ella.
 *
 *   node scripts/eliminar-usuario.mjs --email viejo@dominio.com            (simulacro)
 *   node scripts/eliminar-usuario.mjs --email viejo@dominio.com --apply
 *   node scripts/eliminar-usuario.mjs --email viejo@dominio.com --apply --con-expediente
 *
 * **Que se borra.** La fila de `User`: correo, contrasena, segundo factor y version de
 * sesion. La cuenta deja de existir y no puede volver a entrar.
 *
 * **Que NO se borra** (y es lo que importa):
 *
 *   - El **expediente** (`MemberProfile`): su `userId` queda a NULL
 *     (`onDelete: SetNull`). Los datos de un miembro son suyos, no de la cuenta: borrarlos
 *     por quitar un acceso seria destruir informacion de negocio. El expediente sigue
 *     ahi, solo deja de estar vinculado a una cuenta.
 *   - La **auditoria** (`AuditLog`): `actorUserId` queda a NULL, pero `actorEmail` y
 *     `actorRole` estan congelados en cada registro, asi que el historial sigue siendo
 *     legible y atribuible a quien lo hizo.
 *
 * **Salvaguardas** (se niega a borrar):
 *
 *   - si es el **ultimo ADMIN** de la base: dejaria el panel sin acceso;
 *   - si su correo es el de la cuenta activa (`ADMIN_ACCOUNT_EMAIL`);
 *   - si tiene expediente con documentos o cuotas, salvo `--con-expediente`.
 *
 * Antes de borrar guarda la fila completa en `backups/` para poder restaurarla.
 */
import { config as loadEnv } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { Client } from "pg";
import { dbSslFor } from "../src/lib/db-ssl.mjs";

loadEnv({ path: [".env.local", ".env"] });

const APLICAR = process.argv.includes("--apply");
const CON_EXPEDIENTE = process.argv.includes("--con-expediente");

const indiceEmail = process.argv.indexOf("--email");
const EMAIL = (indiceEmail > -1 ? process.argv[indiceEmail + 1] : "").trim().toLowerCase();

if (!EMAIL) {
  console.error(
    "Uso: node scripts/eliminar-usuario.mjs --email <correo> [--apply] [--con-expediente]",
  );
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL.");
  process.exit(1);
}

const CUENTA_ACTIVA = (process.env.ADMIN_ACCOUNT_EMAIL ?? "").trim().toLowerCase();

const db = new Client({ connectionString: DATABASE_URL, ssl: dbSslFor(DATABASE_URL) });

/** Marca de tiempo para el nombre del respaldo, sin dos puntos (Windows no los admite). */
function marcaDeTiempo() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

await db.connect();

try {
  // -------------------------------------------------------------------------
  // 1. La cuenta
  // -------------------------------------------------------------------------
  const { rows: usuarios } = await db.query(`SELECT * FROM "User" WHERE lower("email") = $1`, [
    EMAIL,
  ]);

  if (usuarios.length === 0) {
    console.log(`\nNo existe ninguna cuenta con el correo ${EMAIL}. Nada que hacer.\n`);
  } else {
    const usuario = usuarios[0];

    console.log(`\nCuenta encontrada: ${usuario.email}`);
    console.log(`  id              ${usuario.id}`);
    console.log(`  nombre          ${usuario.nombre} ${usuario.apellido}`);
    console.log(`  rol             ${usuario.role}`);
    console.log(`  es miembro      ${usuario.isMember ? "si" : "no"}`);
    console.log(`  segundo factor  ${usuario.totpEnabled ? "activado" : "no"}`);
    console.log(`  ultimo acceso   ${usuario.lastLoginAt ?? "nunca"}`);
    console.log(`  creada          ${usuario.createdAt}`);

    // -----------------------------------------------------------------------
    // 2. Que se lleva por delante
    // -----------------------------------------------------------------------
    const { rows: admins } = await db.query(
      `SELECT count(*)::int AS total FROM "User" WHERE "role" = 'ADMIN'`,
    );
    const totalAdmins = admins[0].total;

    const { rows: perfiles } = await db.query(
      `SELECT p."id", p."cedula",
              (SELECT count(*)::int FROM "MemberAsset"        WHERE "profileId" = p."id") AS documentos,
              (SELECT count(*)::int FROM "InstallmentPayment" WHERE "profileId" = p."id") AS cuotas
         FROM "MemberProfile" p
        WHERE p."userId" = $1`,
      [usuario.id],
    );

    const { rows: auditoria } = await db.query(
      `SELECT count(*)::int AS total FROM "AuditLog" WHERE "actorUserId" = $1`,
      [usuario.id],
    );

    console.log(`\nQue se lleva por delante:`);
    console.log(`  administradores en la base   ${totalAdmins}`);
    console.log(`  expediente vinculado         ${perfiles.length === 0 ? "ninguno" : "SI"}`);
    console.log(`  registros de auditoria       ${auditoria[0].total} (se conservan)`);

    if (perfiles.length > 0) {
      const perfil = perfiles[0];

      console.log(
        `\n  Expediente ${perfil.cedula}: ${perfil.documentos} documento(s), ${perfil.cuotas} cuota(s).`,
      );
      console.log("  El expediente NO se borra: solo se le quita el vinculo con la cuenta.");
    }

    // -----------------------------------------------------------------------
    // 3. Salvaguardas
    // -----------------------------------------------------------------------
    const bloqueos = [];

    if (usuario.role === "ADMIN" && totalAdmins <= 1) {
      bloqueos.push(
        "es el ULTIMO administrador: borrarlo dejaria el panel sin acceso. Crea otro ADMIN antes.",
      );
    }

    if (CUENTA_ACTIVA && usuario.email.toLowerCase() === CUENTA_ACTIVA) {
      bloqueos.push(
        `su correo es el de la cuenta activa (ADMIN_ACCOUNT_EMAIL=${CUENTA_ACTIVA}), ` +
          "que es la que se usa para entrar.",
      );
    }

    if (perfiles.length > 0 && !CON_EXPEDIENTE) {
      bloqueos.push(
        "tiene un expediente vinculado. Si de verdad hay que quitarle el acceso conservando " +
          "los datos, repite con --con-expediente (el expediente se conserva igual).",
      );
    }

    if (bloqueos.length > 0) {
      console.log("\nNO SE BORRA:");

      for (const motivo of bloqueos) console.log(`  - ${motivo}`);

      console.log("");
    } else if (!APLICAR) {
      console.log("\nSIMULACRO: se borraria la cuenta; expediente y auditoria se conservan.");
      console.log("Repite con --apply para hacerlo.\n");
    } else {
      // ---------------------------------------------------------------------
      // 4. Respaldo y borrado
      // ---------------------------------------------------------------------
      mkdirSync("backups", { recursive: true });

      const ruta = `backups/usuario-eliminado-${marcaDeTiempo()}.json`;

      writeFileSync(
        ruta,
        JSON.stringify(
          { cuando: new Date().toISOString(), script: "eliminar-usuario.mjs", usuario },
          null,
          2,
        ),
        "utf8",
      );

      const { rows: borradas } = await db.query(
        `DELETE FROM "User" WHERE "id" = $1 RETURNING "id", "email", "role"`,
        [usuario.id],
      );

      console.log(`\nCuenta borrada: ${borradas[0]?.email ?? usuario.email}`);
      console.log(`  respaldo      ${ruta}`);
      console.log("  expediente    conservado (userId a NULL)");
      console.log(
        `  auditoria     conservada (${auditoria[0].total} registro(s), actorEmail intacto)`,
      );
      console.log("");
    }

  }
} finally {
  await db.end().catch(() => undefined);
}
