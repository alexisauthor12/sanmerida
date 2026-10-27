/**
 * Cifrado de campos sueltos (`docs/SEGURIDAD_INTEGRAL.md` 3.3).
 *
 * Cifra **a nivel de columna** los datos personales que no se consultan ni se ordenan
 * por base de datos: direccion, referencias y las coordenadas de los tres pines de
 * ubicacion. No es lo mismo que cifrar el disco: si alguien se lleva un volcado de la
 * base (o mira por encima en el panel de Supabase), ve texto sin valor.
 *
 * AES-256-GCM con IV aleatorio por valor. El formato es **autodescriptivo**:
 *
 *     enc:v1:<iv en base64>:<cifrado en base64>
 *
 * Ese prefijo es lo que permite que convivan valores cifrados y heredados en claro
 * durante la migracion: al leer, lo que no empieza por `enc:v1:` se devuelve tal cual.
 * Asi nada se rompe si la migracion se para a medias.
 *
 * El **nombre del campo va como dato asociado** (AAD): el texto cifrado de `direccion`
 * no se puede pegar en `references` y que cuele. GCM falla si el AAD no coincide.
 *
 * Modulo puro sobre Web Crypto: sin dependencias, para poder probarlo.
 */

/** Marca de un valor cifrado. El `v1` permite cambiar el formato mas adelante. */
export const PII_PREFIX = "enc:v1:";

/** Separador de las partes del formato. Base64 no lo contiene, asi que es seguro. */
const SEPARADOR = ":";

/** Bytes del vector de inicializacion. 12 es lo que recomienda GCM. */
const IV_BYTES = 12;

/** Contexto de derivacion: separa esta clave de cualquier otro uso del mismo secreto. */
const CONTEXTO = "sanmerida/pii/v1";

function aBase64(bytes) {
  let binario = "";

  for (const byte of bytes) binario += String.fromCharCode(byte);

  return btoa(binario);
}

function deBase64(texto) {
  const binario = atob(texto);
  const bytes = new Uint8Array(binario.length);

  for (let indice = 0; indice < binario.length; indice += 1) {
    bytes[indice] = binario.charCodeAt(indice);
  }

  return bytes;
}

/**
 * Deriva una clave AES-256 del secreto, **con contexto propio**.
 *
 * El contexto evita que la misma clave sirva para dos cosas distintas si alguien
 * reutiliza el secreto: la de aqui no es la que firma sesiones ni la que cifra las
 * claves de miembro, aunque el secreto sea el mismo.
 *
 * @param {string} secreto
 * @returns {Promise<CryptoKey>}
 */
async function derivarClave(secreto) {
  const material = new TextEncoder().encode(`${CONTEXTO}|${secreto}`);
  const resumen = await crypto.subtle.digest("SHA-256", material);

  return crypto.subtle.importKey("raw", resumen, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** ¿Este valor ya esta cifrado por nosotros? */
export function isEncryptedField(value) {
  return typeof value === "string" && value.startsWith(PII_PREFIX);
}

/**
 * Cifra un texto.
 *
 * @param {string} plano
 * @param {string} secreto
 * @param {string} campo Nombre del campo, usado como dato asociado.
 * @returns {Promise<string>} valor cifrado con el formato `enc:v1:...`
 */
export async function encryptField(plano, secreto, campo = "") {
  const clave = await derivarClave(secreto);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));

  const cifrado = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(campo) },
    clave,
    new TextEncoder().encode(String(plano)),
  );

  return `${PII_PREFIX}${aBase64(iv)}${SEPARADOR}${aBase64(new Uint8Array(cifrado))}`;
}

/**
 * Descifra un valor. Devuelve `null` si no se puede abrir (secreto equivocado, valor
 * corrupto o AAD que no cuadra): nunca lanza, porque un dato ilegible no debe tumbar
 * la pantalla que lo muestra.
 *
 * @param {string} valor
 * @param {string} secreto
 * @param {string} campo
 * @returns {Promise<string | null>}
 */
export async function decryptField(valor, secreto, campo = "") {
  if (!isEncryptedField(valor)) return null;

  try {
    const partes = valor.slice(PII_PREFIX.length).split(SEPARADOR);

    if (partes.length !== 2) return null;

    const clave = await derivarClave(secreto);

    const abierto = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: deBase64(partes[0]), additionalData: new TextEncoder().encode(campo) },
      clave,
      deBase64(partes[1]),
    );

    return new TextDecoder().decode(abierto);
  } catch {
    return null;
  }
}

/**
 * Prueba varios secretos en orden (activo y luego heredado) y devuelve el primero que
 * abra el valor. Mismo patron que las claves de miembro, para poder rotar sin cortes.
 *
 * @param {string} valor
 * @param {string[]} secretos
 * @param {string} campo
 * @returns {Promise<string | null>}
 */
export async function decryptFieldWithFallback(valor, secretos, campo = "") {
  for (const secreto of secretos) {
    if (!secreto) continue;

    const abierto = await decryptField(valor, secreto, campo);

    if (abierto !== null) return abierto;
  }

  return null;
}
