/**
 * TOTP (RFC 6238) y codigos de recuperacion: segundo factor para las cuentas.
 *
 * Sin dependencias externas. `crypto.subtle` existe tanto en Node 20+ como en
 * Cloudflare Workers, asi que el mismo codigo sirve para las pruebas y para
 * produccion (y no anade peso al Worker).
 *
 * El secreto vive en base32, el formato que entienden todas las apps
 * autenticadoras (Google Authenticator, Authy, 1Password, Aegis...).
 */

/** Alfabeto base32 (RFC 4648). */
const ALFABETO_BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Alfabeto base32: 32 simbolos exactos (26 letras + los digitos 2-7). Al ser
 * potencia de dos se toma `byte & 31` sin sesgo de modulo.
 */
const ALFABETO_RECUPERACION = ALFABETO_BASE32;

/**
 * Caracteres que se descartan al emitir codigos de recuperacion porque se
 * confunden al leerlos o al teclearlos (I/l/1, O/0, L/1). Se reintenta con otro
 * byte aleatorio, asi que el reparto sigue siendo uniforme.
 */
const CARACTERES_AMBIGUOS = new Set(["I", "L", "O"]);

/** 20 bytes = 160 bits, lo que recomienda el RFC 4226 para HMAC-SHA1. */
const BYTES_SECRETO = 20;

const LARGO_RECUPERACION = 10;

export const TOTP_DIGITOS = 6;
export const TOTP_PERIODO_SEGUNDOS = 30;

/** Cuantos codigos de recuperacion se emiten de una vez. */
export const TOTP_CODIGOS_RECUPERACION = 8;

/** Normaliza a Uint8Array; null si la entrada no es binaria. */
function toBytes(value) {
  if (!value) return null;

  if (value instanceof Uint8Array) return value;

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  if (value instanceof ArrayBuffer) return new Uint8Array(value);

  return null;
}

/**
 * Comparacion en tiempo constante. Evita filtrar informacion por el tiempo de
 * respuesta al comparar codigos o hashes.
 */
export function igualdadConstante(a, b) {
  const uno = String(a ?? "");
  const otro = String(b ?? "");

  if (uno.length !== otro.length) return false;

  let diferencia = 0;

  for (let indice = 0; indice < uno.length; indice += 1) {
    diferencia |= uno.charCodeAt(indice) ^ otro.charCodeAt(indice);
  }

  return diferencia === 0;
}

/** Codifica bytes a base32 (sin relleno). */
export function base32Encode(bytes) {
  const datos = toBytes(bytes);

  if (!datos) return "";

  let bits = "";
  let salida = "";

  for (const byte of datos) {
    bits += byte.toString(2).padStart(8, "0");
  }

  for (let indice = 0; indice < bits.length; indice += 5) {
    const trozo = bits.slice(indice, indice + 5).padEnd(5, "0");

    salida += ALFABETO_BASE32[Number.parseInt(trozo, 2)];
  }

  return salida;
}

/**
 * Decodifica base32. Es tolerante a proposito: ignora espacios, guiones y
 * minusculas, porque el usuario teclea el secreto a mano desde su app.
 */
export function base32Decode(value) {
  const limpio = String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, "");

  if (!limpio) return new Uint8Array(0);

  let bits = "";

  for (const caracter of limpio) {
    bits += ALFABETO_BASE32.indexOf(caracter).toString(2).padStart(5, "0");
  }

  const salida = [];

  for (let indice = 0; indice + 8 <= bits.length; indice += 8) {
    salida.push(Number.parseInt(bits.slice(indice, indice + 8), 2));
  }

  return new Uint8Array(salida);
}

/** Genera un secreto nuevo (160 bits) en base32. */
export function generateTotpSecret() {
  const bytes = new Uint8Array(BYTES_SECRETO);

  crypto.getRandomValues(bytes);

  return base32Encode(bytes);
}

/**
 * HOTP (RFC 4226): HMAC del contador, truncado dinamicamente.
 * @returns {Promise<string>} codigo de `digitos` cifras, con ceros a la izquierda.
 */
async function hotp(secreto, contador, digitos, algoritmo) {
  const mensaje = new Uint8Array(8);
  let valor = contador;

  for (let indice = 7; indice >= 0; indice -= 1) {
    mensaje[indice] = valor & 0xff;
    valor = Math.floor(valor / 256);
  }

  const clave = await crypto.subtle.importKey(
    "raw",
    secreto,
    { name: "HMAC", hash: algoritmo },
    false,
    ["sign"],
  );

  const firma = new Uint8Array(await crypto.subtle.sign("HMAC", clave, mensaje));

  // Truncado dinamico: los 4 bits bajos del ultimo byte dan el desplazamiento.
  const desplazamiento = firma[firma.length - 1] & 0x0f;
  const binario =
    ((firma[desplazamiento] & 0x7f) << 24) |
    ((firma[desplazamiento + 1] & 0xff) << 16) |
    ((firma[desplazamiento + 2] & 0xff) << 8) |
    (firma[desplazamiento + 3] & 0xff);

  return String(binario % 10 ** digitos).padStart(digitos, "0");
}

/** Deja solo los digitos de un codigo; "" si no tiene la longitud esperada. */
export function normalizeTotpCode(value) {
  const limpio = String(value ?? "").replace(/\D/g, "");

  return limpio.length === TOTP_DIGITOS ? limpio : "";
}

/**
 * Calcula el codigo valido en un instante dado.
 * @param {string} secret secreto en base32.
 * @param {{ timestamp?: number, digitos?: number, periodo?: number, algoritmo?: string }} [options]
 */
export async function generateTotpCode(secret, options = {}) {
  const {
    timestamp = Date.now(),
    digitos = TOTP_DIGITOS,
    periodo = TOTP_PERIODO_SEGUNDOS,
    algoritmo = "SHA-1",
  } = options;

  const clave = base32Decode(secret);

  if (!clave.length) throw new Error("El secreto TOTP no es valido.");

  return hotp(clave, Math.floor(timestamp / 1000 / periodo), digitos, algoritmo);
}

/**
 * Verifica un codigo con tolerancia a la deriva del reloj.
 *
 * @param {string} secret secreto en base32.
 * @param {string} code codigo tecleado por el usuario.
 * @param {{ ventana?: number, timestamp?: number, digitos?: number, periodo?: number, algoritmo?: string }} [options]
 *   `ventana` son los periodos de margen a cada lado (1 = +-30 s, lo habitual).
 * @returns {Promise<boolean>}
 */
export async function verifyTotpCode(secret, code, options = {}) {
  const {
    ventana = 1,
    timestamp = Date.now(),
    digitos = TOTP_DIGITOS,
    periodo = TOTP_PERIODO_SEGUNDOS,
    algoritmo = "SHA-1",
  } = options;

  const normalizado = normalizeTotpCode(code);
  const clave = base32Decode(secret);

  if (!normalizado || !clave.length) return false;

  const contadorBase = Math.floor(timestamp / 1000 / periodo);

  // Se recorren todas las ventanas sin cortocircuito, para no filtrar por tiempo
  // en que periodo acerto.
  let valido = false;

  for (let desplazamiento = -ventana; desplazamiento <= ventana; desplazamiento += 1) {
    const esperado = await hotp(clave, contadorBase + desplazamiento, digitos, algoritmo);

    if (igualdadConstante(esperado, normalizado)) valido = true;
  }

  return valido;
}

/**
 * URI `otpauth://` que consumen las apps autenticadoras.
 * @param {{ secret?: string, accountName?: string, issuer?: string, digitos?: number, periodo?: number }} [options]
 */
export function buildOtpAuthUri({
  secret,
  accountName,
  issuer = "SAN Merida",
  digitos = TOTP_DIGITOS,
  periodo = TOTP_PERIODO_SEGUNDOS,
} = {}) {
  const etiqueta = encodeURIComponent(`${issuer}:${String(accountName ?? "")}`);
  // Se construye a mano en vez de con URLSearchParams: este codifica los espacios
  // como "+" y algunas apps autenticadoras los leen literales.
  const parametros = [
    ["secret", String(secret ?? "").toUpperCase()],
    ["issuer", issuer],
    ["algorithm", "SHA1"],
    ["digits", String(digitos)],
    ["period", String(periodo)],
  ]
    .map(([clave, valor]) => `${clave}=${encodeURIComponent(valor)}`)
    .join("&");

  return `otpauth://totp/${etiqueta}?${parametros}`;
}

/** Agrupa el secreto en bloques de 4 para poder leerlo y teclearlo. */
export function formatTotpSecret(secret) {
  return String(secret ?? "")
    .toUpperCase()
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

/** Genera codigos de recuperacion de un solo uso (~48 bits cada uno). */
export function generateRecoveryCodes(cantidad = TOTP_CODIGOS_RECUPERACION) {
  const total = Number.isFinite(cantidad) && cantidad > 0 ? Math.floor(cantidad) : 0;
  const codigos = [];

  for (let indice = 0; indice < total; indice += 1) {
    let codigo = "";

    // Se reintenta hasta completar la longitud: los caracteres ambiguos se
    // descartan en vez de sustituirse, para no perder entropia.
    while (codigo.length < LARGO_RECUPERACION) {
      const byte = new Uint8Array(1);

      crypto.getRandomValues(byte);

      const candidato = ALFABETO_RECUPERACION[byte[0] & 31];

      if (!CARACTERES_AMBIGUOS.has(candidato)) codigo += candidato;
    }

    codigos.push(codigo);
  }

  return codigos;
}

/** Normaliza un codigo de recuperacion (tolera guiones, espacios y minusculas). */
export function normalizeRecoveryCode(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, "")
    .replace(/[ILO]/g, "");
}

/** Hash SHA-256 en hex de un codigo de recuperacion. "" si el codigo es invalido. */
export async function hashRecoveryCode(code) {
  const normalizado = normalizeRecoveryCode(code);

  if (!normalizado) return "";

  const resumen = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizado));

  return Array.from(new Uint8Array(resumen))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Busca un codigo de recuperacion dentro de la lista de hashes.
 * @returns {Promise<number>} indice del codigo usado, o -1 si no coincide.
 */
export async function findRecoveryCodeIndex(code, hashes) {
  const objetivo = await hashRecoveryCode(code);

  if (!objetivo || !Array.isArray(hashes)) return -1;

  let encontrado = -1;

  for (let indice = 0; indice < hashes.length; indice += 1) {
    if (igualdadConstante(objetivo, hashes[indice])) encontrado = indice;
  }

  return encontrado;
}
