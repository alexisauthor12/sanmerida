/**
 * Rotacion del secreto que cifra las credenciales de miembro
 * (`docs/SEGURIDAD_INTEGRAL.md` 13.7).
 *
 * Recifra cada `MemberProfile.memberKeyCipher` desde `AUTH_SECRET` (heredado) hacia
 * `MEMBER_KEY_ENCRYPTION_SECRET` (nuevo). Es **idempotente**: se puede repetir sin
 * efectos, porque primero comprueba con que secreto abre cada fila.
 *
 * Requisitos previos (seccion 13.7):
 *   1. Respaldo de la base de datos (`node scripts/backup-users.mjs`).
 *   2. `MEMBER_KEY_ENCRYPTION_SECRET` definido en el entorno, **distinto** de
 *      `AUTH_SECRET`.
 *   3. Ventana sin trafico (el proceso no corta el servicio, pero conviene).
 *
 * Uso:
 *   node scripts/rotate-member-key-secret.mjs            (simulacro)
 *   node scripts/rotate-member-key-secret.mjs --apply
 *
 * Al terminar, la verificacion es una lectura de prueba en el panel (Monitor de
 * cuotas -> credenciales) y `node scripts/check-storage-integrity.mjs`.
 */
import { config as loadEnv } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { decryptMemberKey, encryptMemberKey } from "../src/lib/member-credentials.mjs";

// Como el resto de scripts: los valores viven en `.env.local`. `dotenv/config` lee
// **solo** `.env`, asi que cualquier secreto que este alli llegaria vacio sin avisar.
loadEnv({ path: [".env.local", ".env"] });

/**
 * `.dev.vars` es el archivo que carga `wrangler`, y en local puede tener los mismos
 * secretos. Se lee como **respaldo**: no pisa nada que ya venga del entorno ni de
 * `.env.local`, que es lo que usa la aplicacion.
 */
function cargarDevVars() {
  const ruta = path.join(process.cwd(), ".dev.vars");

  if (!existsSync(ruta)) return 0;

  let cargadas = 0;

  for (const linea of readFileSync(ruta, "utf8").split(/\r?\n/)) {
    const limpia = linea.trim();

    if (!limpia || limpia.startsWith("#")) continue;

    const separador = limpia.indexOf("=");

    if (separador < 1) continue;

    const clave = limpia.slice(0, separador).trim();
    const valor = limpia
      .slice(separador + 1)
      .trim()
      .replace(/^["']|["']$/g, "");

    if (!process.env[clave] && valor) {
      process.env[clave] = valor;
      cargadas += 1;
    }
  }

  return cargadas;
}

cargarDevVars();

const aplicar = process.argv.includes("--apply");

function limpiar(valor) {
  return String(valor ?? "").trim().replace(/^['"]|['"]$/g, "");
}

const secretoNuevo = limpiar(process.env.MEMBER_KEY_ENCRYPTION_SECRET);
const secretoHeredado = limpiar(process.env.AUTH_SECRET);

if (!secretoNuevo) {
  console.error(
    "Falta MEMBER_KEY_ENCRYPTION_SECRET.\n" +
      "Define el secreto nuevo en el entorno (distinto de AUTH_SECRET) y vuelve a intentarlo.\n" +
      "En Cloudflare: npx wrangler secret put MEMBER_KEY_ENCRYPTION_SECRET",
  );
  process.exit(1);
}

if (!secretoHeredado) {
  console.error("Falta AUTH_SECRET: sin el no se pueden abrir las credenciales actuales.");
  process.exit(1);
}

if (secretoNuevo === secretoHeredado) {
  console.error(
    "MEMBER_KEY_ENCRYPTION_SECRET y AUTH_SECRET son iguales: no hay nada que rotar y la\n" +
      "separacion no se estaria consiguiendo. Define un secreto distinto.",
  );
  process.exit(1);
}

// El recifrado hace `update` fila a fila: se usa el pooler de SESION (5432), igual
// que el backfill de roles.
const connectionString = limpiar(process.env.DIRECT_URL) || limpiar(process.env.DATABASE_URL);

if (!connectionString) {
  console.error("Falta DIRECT_URL (o DATABASE_URL).");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, maxUses: 1 }) });

try {
  const perfiles = await prisma.memberProfile.findMany({
    where: { memberKeyCipher: { not: null } },
    select: { id: true, cedula: true, memberKeyCipher: true },
  });

  console.log(`Expedientes con credencial cifrada: ${perfiles.length}`);

  const alDia = [];
  const migrados = [];
  const ilegibles = [];

  for (const perfil of perfiles) {
    const cifrado = perfil.memberKeyCipher ?? "";

    // Idempotencia: si ya abre con el secreto nuevo, no se toca.
    if ((await decryptMemberKey(cifrado, secretoNuevo)) !== null) {
      alDia.push(perfil.id);
      continue;
    }

    const claro = await decryptMemberKey(cifrado, secretoHeredado);

    if (claro === null) {
      // No se sobrescribe nada: una fila ilegible puede ser un dato irrecuperable y
      // hay que revisarla a mano.
      ilegibles.push(perfil.cedula ?? perfil.id);
      continue;
    }

    const recifrado = await encryptMemberKey(claro, secretoNuevo);

    if (!recifrado) {
      ilegibles.push(perfil.cedula ?? perfil.id);
      continue;
    }

    if (aplicar) {
      await prisma.memberProfile.update({
        where: { id: perfil.id },
        data: { memberKeyCipher: recifrado },
      });
    }

    migrados.push(perfil.id);
  }

  console.log(`  Ya con el secreto nuevo: ${alDia.length}`);
  console.log(`  Pendientes de recifrar: ${migrados.length}`);
  console.log(`  Ilegibles (requieren revision manual): ${ilegibles.length}`);

  if (ilegibles.length > 0) {
    console.warn(`\nCedulas ilegibles: ${ilegibles.join(", ")}`);
    console.warn(
      "No se ha tocado ninguna de esas filas. Si no se pueden abrir con ningun secreto,\n" +
        "el dato ya estaba perdido antes de esta rotacion: hay que regenerar la credencial\n" +
        "del miembro desde el panel.",
    );
  }

  if (migrados.length === 0) {
    console.log("\nNada que recifrar.");
  } else if (!aplicar) {
    console.log(`\nSIMULACRO: se recifrarian ${migrados.length} fila(s). Repite con --apply.`);
  } else {
    // Resumen auditable de la rotacion.
    await prisma.auditLog.create({
      data: {
        action: "CREDENCIAL_ROTATE",
        actorRole: "SYSTEM",
        targetType: "MemberProfile",
        metadata: {
          via: "script_cli",
          recifradas: migrados.length,
          alDia: alDia.length,
          ilegibles: ilegibles.length,
        },
        success: ilegibles.length === 0,
      },
    });

    console.log(
      `\nRotacion aplicada: ${migrados.length} credencial(es) recifrada(s) con el secreto nuevo.\n` +
        "Queda registrado en la auditoria (CREDENCIAL_ROTATE).\n" +
        "Ahora: lectura de prueba en el panel y `node scripts/check-storage-integrity.mjs`.",
    );
  }
} catch (error) {
  console.error("Fallo:", error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
