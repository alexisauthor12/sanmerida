/**
 * Migracion del cifrado a nivel de columna (`docs/SEGURIDAD_INTEGRAL.md` 3.3).
 *
 * Cifra los campos personales que hoy estan en claro en `MemberProfile`: direccion,
 * referencias y los tres pines de ubicacion (latitud, longitud y enlace).
 *
 * Va **por pasos y a proposito**, para no perder nada:
 *
 *   1. `--capturar`   guarda en un archivo los valores actuales, tal cual estan en la
 *                     base. Es la red de seguridad: si algo saliera mal, ahi estan.
 *   2. `--verificar`  compara la base con esa captura. Se ejecuta **despues** de cambiar
 *                     el tipo de las columnas de coordenadas, para demostrar que el
 *                     cambio de tipo no altero ni un valor.
 *   3. (simulacro)    dice cuantas filas y cuantos campos se cifrarian.
 *   4. `--apply`      cifra en el sitio. Es idempotente: lo que ya esta cifrado se salta.
 *
 * Usa `pg` directo (no el cliente de la aplicacion) para ver y escribir **el valor
 * crudo**: con la extension de Prisma de por medio no se podria comprobar que hay
 * realmente guardado.
 *
 * Uso:
 *   node scripts/encrypt-member-pii.mjs --capturar
 *   node scripts/encrypt-member-pii.mjs --verificar
 *   node scripts/encrypt-member-pii.mjs
 *   node scripts/encrypt-member-pii.mjs --apply
 */
import { config as loadEnv } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Client } from "pg";
import { CAMPOS_PII, decryptPiiFields } from "../src/lib/member-pii.mjs";
import { encryptField, isEncryptedField } from "../src/lib/field-crypto.mjs";
import { resolveMemberKeySecrets } from "../src/lib/member-key-secret.mjs";
import { dbSslFor } from "../src/lib/db-ssl.mjs";

loadEnv({ path: [".env.local", ".env"] });

const CAPTURAR = process.argv.includes("--capturar");
const VERIFICAR = process.argv.includes("--verificar");
const COMPROBAR = process.argv.includes("--comprobar");
const APLICAR = process.argv.includes("--apply");
const ARCHIVO = "backups/pii-antes-de-cifrar.json";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL.");
  process.exit(1);
}

const { activo } = resolveMemberKeySecrets(process.env);

if (!activo) {
  console.error(
    "Falta el secreto de cifrado (MEMBER_KEY_ENCRYPTION_SECRET o AUTH_SECRET).\n" +
      "Sin el, cifrar dejaria los datos irrecuperables.",
  );
  process.exit(1);
}

/** Lee todas las filas con los campos personales, en crudo. */
async function leerTodo(db) {
  const columnas = CAMPOS_PII.map((campo) => `"${campo}"`).join(", ");
  const { rows } = await db.query(
    `SELECT "id", "cedula", ${columnas} FROM "MemberProfile" ORDER BY "cedula"`,
  );

  return rows;
}

/** Cuantos campos de una fila estan en claro (es decir, pendientes de cifrar). */
function pendientes(fila) {
  return CAMPOS_PII.filter((campo) => {
    const valor = fila[campo];

    return valor !== null && valor !== undefined && valor !== "" && !isEncryptedField(valor);
  });
}

/** Compara dos valores tolerando el cambio de numero a texto que hace Postgres. */
function mismoValor(antes, despues) {
  if (antes === null || antes === undefined) {
    return despues === null || despues === undefined || despues === "";
  }

  if (typeof antes === "number" || typeof despues === "number") {
    const a = Number(antes);
    const b = Number(despues);

    return Number.isFinite(a) && Number.isFinite(b) && a === b;
  }

  return String(antes) === String(despues);
}

const db = new Client({
  connectionString: DATABASE_URL,
  ssl: dbSslFor(DATABASE_URL),
  connectionTimeoutMillis: 20000,
});

await db.connect();

try {
  const filas = await leerTodo(db);

  console.log(`\nFilas en MemberProfile: ${filas.length}\n`);

  // --- 1. Capturar ---------------------------------------------------------
  if (CAPTURAR) {
    mkdirSync("backups", { recursive: true });

    writeFileSync(
      ARCHIVO,
      JSON.stringify({ fecha: new Date().toISOString(), filas }, null, 2),
      "utf8",
    );

    console.log(`Capturados los valores actuales en ${ARCHIVO}`);
    console.log("Guardalo en un sitio seguro: son los datos personales EN CLARO.\n");
  }

  // --- 2. Verificar --------------------------------------------------------
  if (VERIFICAR) {
    if (!existsSync(ARCHIVO)) {
      console.error(`No hay captura en ${ARCHIVO}. Ejecuta antes --capturar.`);
      process.exitCode = 1;
    } else {
      const captura = JSON.parse(readFileSync(ARCHIVO, "utf8"));
      const porCedula = new Map(captura.filas.map((fila) => [fila.cedula, fila]));

      let diferencias = 0;

      for (const fila of filas) {
        const antes = porCedula.get(fila.cedula);

        if (!antes) {
          console.log(`  NUEVA desde la captura: ${fila.cedula}`);
          continue;
        }

        for (const campo of CAMPOS_PII) {
          if (!mismoValor(antes[campo], fila[campo])) {
            console.log(`  DISTINTO ${fila.cedula}.${campo}: ${JSON.stringify(antes[campo])} -> ${JSON.stringify(fila[campo])}`);
            diferencias += 1;
          }
        }
      }

      console.log(
        diferencias === 0
          ? `\nVerificacion OK: ${filas.length} filas, ningun valor alterado.\n`
          : `\nATENCION: ${diferencias} valor(es) distintos de la captura. No continuar.\n`,
      );

      if (diferencias > 0) process.exitCode = 1;
    }
  }

  // --- 4. Comprobar: descifrar lo guardado y comparar con la captura ---------
  if (COMPROBAR) {
    if (!existsSync(ARCHIVO)) {
      console.error(`No hay captura en ${ARCHIVO}: no hay con que comparar.`);
      process.exitCode = 1;
    } else {
      const captura = JSON.parse(readFileSync(ARCHIVO, "utf8"));
      const porCedula = new Map(captura.filas.map((fila) => [fila.cedula, fila]));

      let malos = 0;
      let enClaro = 0;

      for (const fila of filas) {
        const descifrada = await decryptPiiFields(fila);
        const antes = porCedula.get(fila.cedula);

        for (const campo of CAMPOS_PII) {
          const guardado = fila[campo];

          if (guardado !== null && guardado !== undefined && guardado !== "" && !isEncryptedField(guardado)) {
            enClaro += 1;
          }

          if (!antes) continue;

          // Se comparan como numeros cuando corresponde, porque la captura guardo
          // las coordenadas como numero y ahora vuelven como numero tambien.
          const esperado = antes[campo];
          const obtenido = descifrada[campo];

          const iguales =
            esperado === null || esperado === undefined || esperado === ""
              ? obtenido === null || obtenido === undefined || obtenido === ""
              : Number(esperado) === Number(obtenido) || String(esperado) === String(obtenido);

          if (!iguales) {
            console.log(`  DISTINTO ${fila.cedula}.${campo}`);
            malos += 1;
          }
        }
      }

      console.log(
        malos === 0
          ? `Comprobacion OK: los ${filas.length} expedientes vuelven a leerse igual que antes de cifrar.`
          : `ATENCION: ${malos} campo(s) no coinciden con la captura.`,
      );

      console.log(
        enClaro === 0
          ? "Y no queda ningun campo personal en claro.\n"
          : `ATENCION: quedan ${enClaro} campo(s) en claro. Ejecuta --apply.\n`,
      );

      if (malos > 0 || enClaro > 0) process.exitCode = 1;
    }
  }

  // --- 5. Cifrar (simulacro o de verdad) -----------------------------------
  if (!CAPTURAR && !VERIFICAR && !COMPROBAR) {
    const conDatos = filas.filter((fila) => pendientes(fila).length > 0);
    const totalCampos = filas.reduce((suma, fila) => suma + pendientes(fila).length, 0);

    console.log(
      APLICAR
        ? `Cifrando ${totalCampos} campo(s) en ${conDatos.length} fila(s)...\n`
        : `Simulacro: se cifrarian ${totalCampos} campo(s) en ${conDatos.length} fila(s).\n`,
    );

    let cifrados = 0;

    for (const fila of filas) {
      const campos = pendientes(fila);

      if (campos.length === 0) continue;

      if (!APLICAR) {
        console.log(`  ${fila.cedula}: ${campos.join(", ")}`);
        continue;
      }

      const asignaciones = [];
      const valores = [];

      for (const campo of campos) {
        asignaciones.push(`"${campo}" = $${valores.length + 1}`);
        valores.push(await encryptField(String(fila[campo]), activo, campo));
      }

      valores.push(fila.id);

      await db.query(
        `UPDATE "MemberProfile" SET ${asignaciones.join(", ")} WHERE "id" = $${valores.length}`,
        valores,
      );

      cifrados += campos.length;
    }

    if (APLICAR) {
      console.log(`Cifrados ${cifrados} campo(s).\n`);
      console.log("Comprueba que la aplicacion sigue mostrando bien los datos.\n");
    } else {
      console.log("\nSimulacro: nada escrito. Repite con --apply.\n");
    }
  }
} finally {
  await db.end().catch(() => undefined);
}
