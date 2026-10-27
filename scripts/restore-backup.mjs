/**
 * Restauracion y verificacion de respaldos cifrados
 * (`docs/SEGURIDAD_INTEGRAL.md` 2.3).
 *
 * Un respaldo que no se ha probado a restaurar no es un respaldo: es una carpeta.
 * Este script hace las dos cosas:
 *
 *   --verificar   descifra en memoria y NO escribe nada. Es la prueba de
 *                 restauracion rapida: confirma que la contrasena abre el archivo.
 *   --carpeta     descifra todos los `.enc` de una carpeta de documentos y
 *                 comprueba cada archivo contra el `sha256` del manifiesto.
 *
 * Requiere `BACKUP_PASSPHRASE`.
 *
 * Uso:
 *   node scripts/restore-backup.mjs --verificar backups/users-2026-10-26.json.enc
 *   node scripts/restore-backup.mjs backups/users-2026-10-26.json.enc
 *   node scripts/restore-backup.mjs --carpeta backups/documents/2026-10-26T10-00-00
 *
 * Nada se sobrescribe sin `--forzar`.
 */
import { config as loadEnv } from "dotenv";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  BACKUP_PASSPHRASE_ENV,
  decryptBackup,
  describeBackup,
  isEncryptedBackup,
} from "../src/lib/backup-crypto.mjs";

loadEnv({ path: [".env.local", ".env"] });

const args = process.argv.slice(2);
const verificar = args.includes("--verificar");
const forzar = args.includes("--forzar");
const indiceCarpeta = args.indexOf("--carpeta");
const carpetaObjetivo = indiceCarpeta >= 0 ? args[indiceCarpeta + 1] : "";

const objetivos = args.filter((arg) => !arg.startsWith("--") && arg !== carpetaObjetivo);

const passphrase = process.env[BACKUP_PASSPHRASE_ENV] ?? "";

if (!passphrase) {
  console.error(
    `Falta ${BACKUP_PASSPHRASE_ENV}.\n` +
      "Sin la contrasena original el respaldo es ilegible: no hay puerta trasera.",
  );
  process.exit(1);
}

if (verificar && objetivos.length === 0) {
  console.error("Uso: node scripts/restore-backup.mjs --verificar <archivo.enc>");
  process.exit(1);
}

if (!verificar && indiceCarpeta < 0 && objetivos.length === 0) {
  console.error(
    "Uso:\n" +
      "  node scripts/restore-backup.mjs --verificar <archivo.enc>\n" +
      "  node scripts/restore-backup.mjs <archivo.enc>\n" +
      "  node scripts/restore-backup.mjs --carpeta <carpeta>",
  );
  process.exit(1);
}

let fallos = 0;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Descifra un archivo y devuelve sus bytes; lanza si no es un respaldo valido. */
async function descifrarArchivo(archivo) {
  const sobre = await readFile(archivo);

  if (!isEncryptedBackup(sobre)) {
    throw new Error("no es un respaldo cifrado (¿se guardó en claro?)");
  }

  return decryptBackup(sobre, passphrase);
}

async function verificarArchivo(archivo) {
  const meta = describeBackup(await readFile(archivo));
  const claro = await descifrarArchivo(archivo);

  console.log(`OK  ${archivo}`);
  console.log(`    ${meta.algoritmo} · ${meta.kdf} · ${meta.iteraciones} iteraciones`);
  console.log(`    contenido descifrado: ${claro.length} bytes`);
  console.log(`    sha256 del contenido: ${sha256(claro)}`);
}

async function restaurarArchivo(archivo, salida) {
  const claro = await descifrarArchivo(archivo);
  const destino = salida ?? archivo.replace(/\.enc$/, "");

  if (existsSync(destino) && !forzar) {
    throw new Error(`${destino} ya existe (usa --forzar para sobrescribir)`);
  }

  await writeFile(destino, claro);

  console.log(`OK  ${archivo} -> ${destino} (${claro.length} bytes)`);
}

/** Recorre una carpeta y descifra cada `.enc`. */
async function restaurarCarpeta(carpeta) {
  if (!existsSync(carpeta)) {
    console.error(`No existe la carpeta ${carpeta}.`);
    process.exit(1);
  }

  const entradas = await readdir(carpeta, { withFileTypes: true });
  const archivos = [];
  const subcarpetas = [];

  for (const entrada of entradas) {
    const ruta = path.join(carpeta, entrada.name);

    if (entrada.isDirectory()) subcarpetas.push(ruta);
    else if (entrada.name.endsWith(".enc")) archivos.push(ruta);
  }

  for (const ruta of subcarpetas) {
    await restaurarCarpeta(ruta);
  }

  // El manifiesto se descifra primero: sus `sha256` son lo que permite comprobar
  // que cada documento descifrado es exactamente el que se respaldo.
  const manifiestoEnc = archivos.find((ruta) => path.basename(ruta) === "manifest.json.enc");
  const hashes = new Map();

  if (manifiestoEnc) {
    const claro = await descifrarArchivo(manifiestoEnc);
    const manifiesto = JSON.parse(new TextDecoder().decode(claro));

    for (const objeto of manifiesto.objects ?? []) {
      if (objeto.sha256) hashes.set(objeto.key, objeto.sha256);
    }

    await restaurarArchivo(manifiestoEnc, path.join(carpeta, "manifest.json"));
  }

  for (const ruta of archivos) {
    if (path.basename(ruta) === "manifest.json.enc") continue;

    try {
      const claro = await descifrarArchivo(ruta);
      const relativa = path.relative(carpeta, ruta).split(path.sep).join("/");
      const esperado = hashes.get(relativa.replace(/\.enc$/, ""));

      if (esperado && sha256(claro) !== esperado) {
        console.error(`ALTERADO  ${relativa} (el sha256 no coincide con el manifiesto)`);
        fallos += 1;
        continue;
      }

      await restaurarArchivo(ruta, ruta.replace(/\.enc$/, ""));
    } catch (error) {
      console.error(`FALLO  ${ruta}: ${error instanceof Error ? error.message : String(error)}`);
      fallos += 1;
    }
  }
}

try {
  if (verificar) {
    for (const archivo of objetivos) {
      await verificarArchivo(archivo);
    }
  } else if (indiceCarpeta >= 0) {
    if (!carpetaObjetivo) {
      console.error("--carpeta necesita una ruta.");
      process.exit(1);
    }

    await restaurarCarpeta(carpetaObjetivo);
  } else {
    for (const archivo of objetivos) {
      await restaurarArchivo(archivo);
    }
  }

  if (fallos > 0) {
    console.error(`\n${fallos} archivo(s) con problemas. Revisar antes de dar el respaldo por bueno.`);
    process.exitCode = 1;
  } else {
    console.log("\nLISTO. Ningun archivo con problemas.");
  }
} catch (error) {
  console.error("Fallo:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
