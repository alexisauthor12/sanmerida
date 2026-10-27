/**
 * Cifrado de los respaldos (`docs/SEGURIDAD_INTEGRAL.md` 2.3).
 *
 * Un respaldo contiene lo mas sensible del sistema: `passwordHash` de todas las
 * cuentas, cedulas, telefonos, direcciones y los documentos de los expedientes.
 * Guardarlo en claro en un disco externo o en la nube es **trasladar** el riesgo de
 * la base de datos a un pendrive.
 *
 * Formato del archivo cifrado: un JSON en claro (para poder inspeccionarlo sin
 * descifrar) con el sobre criptografico dentro:
 *
 * ```json
 * { "formato": "san-backup-v1", "algoritmo": "AES-256-GCM",
 *   "kdf": "PBKDF2-SHA256", "iteraciones": 250000,
 *   "salt": "<base64>", "iv": "<base64>", "datos": "<base64>" }
 * ```
 *
 * AES-GCM autentica el contenido: si alguien altera un solo byte, el descifrado
 * **falla** en vez de devolver datos corruptos. Y como el `salt` y el `iv` son
 * aleatorios en cada ejecucion, dos respaldos del mismo contenido no se parecen.
 *
 * Modulo PURO sobre Web Crypto: el mismo codigo sirve para los scripts y para las
 * pruebas.
 */

export const BACKUP_FORMAT = "san-backup-v1";
export const BACKUP_ALGORITHM = "AES-256-GCM";
export const BACKUP_KDF = "PBKDF2-SHA256";

/** Variable de entorno con la contrasena del respaldo. */
export const BACKUP_PASSPHRASE_ENV = "BACKUP_PASSPHRASE";

/**
 * Longitud minima de la contrasena. Un respaldo cifrado con "1234" no esta
 * cifrado: PBKDF2 frena la fuerza bruta, no la sustituye.
 */
export const MIN_PASSPHRASE_LENGTH = 16;

/** Coste de PBKDF2. Alto a proposito: el respaldo se hace de vez en cuando. */
export const DEFAULT_ITERATIONS = 250000;

const BYTES_SALT = 16;
const BYTES_IV = 12;
const BYTES_CLAVE = 32;
const TAMANO_TROZO = 0x8000;

/** Normaliza la entrada a un Uint8Array; null si no es binario. */
export function toBytes(value) {
  if (!value) return null;

  if (value instanceof Uint8Array) return value;

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  if (value instanceof ArrayBuffer) return new Uint8Array(value);

  return null;
}

/**
 * Bytes aleatorios.
 *
 * `crypto.getRandomValues` tiene un tope de 65.536 bytes por llamada: se rellena
 * por trozos para que el helper siga siendo correcto si algun dia se le pide mas.
 */
function randomBytes(largo) {
  const bytes = new Uint8Array(largo);
  const TOPE = 65536;

  for (let indice = 0; indice < bytes.length; indice += TOPE) {
    crypto.getRandomValues(bytes.subarray(indice, Math.min(indice + TOPE, bytes.length)));
  }

  return bytes;
}

/** Base64 sin depender de que exista `Buffer` (funciona tambien en el Worker). */
function toBase64(bytes) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  let binario = "";

  for (let indice = 0; indice < bytes.length; indice += TAMANO_TROZO) {
    binario += String.fromCharCode(...bytes.subarray(indice, indice + TAMANO_TROZO));
  }

  return btoa(binario);
}

function fromBase64(texto) {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(texto, "base64"));
  }

  const binario = atob(texto);
  const salida = new Uint8Array(binario.length);

  for (let indice = 0; indice < binario.length; indice += 1) {
    salida[indice] = binario.charCodeAt(indice);
  }

  return salida;
}

/** True si la contrasena tiene la longitud minima. */
export function isValidPassphrase(value) {
  return String(value ?? "").length >= MIN_PASSPHRASE_LENGTH;
}

function errorPassphrase() {
  return new Error(
    `La contraseña del respaldo debe tener al menos ${MIN_PASSPHRASE_LENGTH} caracteres.`,
  );
}

async function deriveKey(passphrase, salt, iteraciones) {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(passphrase)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: iteraciones, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: BYTES_CLAVE * 8 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Cifra unos bytes con una contrasena.
 *
 * @param {Uint8Array | ArrayBuffer} plainBytes contenido en claro.
 * @param {string} passphrase contrasena (minimo `MIN_PASSPHRASE_LENGTH`).
 * @param {{ iteraciones?: number }} [options]
 * @returns {Promise<Uint8Array>} el sobre cifrado, listo para escribir en disco.
 */
export async function encryptBackup(plainBytes, passphrase, options = {}) {
  const { iteraciones = DEFAULT_ITERATIONS } = options;
  const datos = toBytes(plainBytes);

  if (!datos || datos.length === 0) {
    throw new Error("No hay datos que cifrar.");
  }

  if (!isValidPassphrase(passphrase)) throw errorPassphrase();

  const salt = randomBytes(BYTES_SALT);
  const iv = randomBytes(BYTES_IV);
  const clave = await deriveKey(passphrase, salt, iteraciones);
  const cifrado = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, clave, datos),
  );

  const sobre = {
    formato: BACKUP_FORMAT,
    algoritmo: BACKUP_ALGORITHM,
    kdf: BACKUP_KDF,
    iteraciones,
    salt: toBase64(salt),
    iv: toBase64(iv),
    datos: toBase64(cifrado),
  };

  return new TextEncoder().encode(JSON.stringify(sobre));
}

/**
 * Lee el sobre sin descifrarlo. Lanza si el archivo no es un respaldo de este
 * formato (fail-closed: no se intenta adivinar).
 */
export function parseEnvelope(value) {
  const texto =
    typeof value === "string"
      ? value
      : new TextDecoder().decode(toBytes(value) ?? new Uint8Array());

  let sobre = null;

  try {
    sobre = JSON.parse(texto);
  } catch {
    throw new Error("El archivo no tiene el formato de respaldo cifrado.");
  }

  const valido =
    sobre &&
    typeof sobre === "object" &&
    sobre.formato === BACKUP_FORMAT &&
    typeof sobre.salt === "string" &&
    typeof sobre.iv === "string" &&
    typeof sobre.datos === "string";

  if (!valido) {
    throw new Error("El archivo no tiene el formato de respaldo cifrado.");
  }

  return sobre;
}

/** True si el contenido parece un respaldo cifrado por este modulo. */
export function isEncryptedBackup(value) {
  try {
    parseEnvelope(value);
    return true;
  } catch {
    return false;
  }
}

/** Metadatos del respaldo, sin contrasena. Sirve para saber que se tiene delante. */
export function describeBackup(value) {
  const sobre = parseEnvelope(value);

  return {
    formato: sobre.formato,
    algoritmo: sobre.algoritmo ?? BACKUP_ALGORITHM,
    kdf: sobre.kdf ?? BACKUP_KDF,
    iteraciones: Number(sobre.iteraciones) || 0,
  };
}

/**
 * Descifra un respaldo.
 *
 * Fail-closed: si la contrasena es incorrecta **o** el archivo fue alterado, lanza.
 * Nunca devuelve datos a medias.
 *
 * @returns {Promise<Uint8Array>}
 */
export async function decryptBackup(envelopeBytes, passphrase) {
  const sobre = parseEnvelope(envelopeBytes);

  if (!isValidPassphrase(passphrase)) throw errorPassphrase();

  const clave = await deriveKey(
    passphrase,
    fromBase64(sobre.salt),
    Number(sobre.iteraciones) || DEFAULT_ITERATIONS,
  );

  try {
    const claro = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(sobre.iv) },
      clave,
      fromBase64(sobre.datos),
    );

    return new Uint8Array(claro);
  } catch {
    // GCM no distingue entre contrasena mala y contenido alterado: se informan las
    // dos posibilidades sin decir cual.
    throw new Error("No se pudo descifrar: contraseña incorrecta o respaldo alterado.");
  }
}
