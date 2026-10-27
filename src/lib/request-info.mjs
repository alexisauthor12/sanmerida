/**
 * Extraccion y saneado de datos de la peticion para la auditoria.
 *
 * Modulo PURO: recibe funciones en lugar de objetos de Next, para poder probarlo
 * igual que el resto de la logica del proyecto.
 *
 * Regla: la auditoria **nunca** guarda datos sensibles (ver
 * `docs/SEGURIDAD_INTEGRAL.md` seccion 6.3).
 */

/** Longitud maxima de cada valor guardado en la auditoria. */
export const MAX_AUDIT_VALUE = 200;

/** Claves que se descartan siempre, coincidan como coincidan. */
const CLAVES_PROHIBIDAS_EXACTAS = new Set([
  "key",
  "clave",
  "hash",
  "pass",
  "password",
  "contrasena",
  "token",
  "secret",
  "authorization",
  "cookie",
  "cipher",
  "memberkey",
  "passwordhash",
  "memberkeycipher",
  "totpsecret",
]);

/** Fragmentos que delatan una clave sensible en cualquier posicion. */
const FRAGMENTOS_PROHIBIDOS = [
  "password",
  "memberkey",
  "cipher",
  "secret",
  "token",
  "authorization",
  "cookie",
  "totp",
  "hash",
];

/** True si el nombre de una clave de metadata debe descartarse. */
export function esClaveSensible(nombre) {
  const clave = String(nombre ?? "").toLowerCase();

  if (CLAVES_PROHIBIDAS_EXACTAS.has(clave)) return true;

  return FRAGMENTOS_PROHIBIDOS.some((fragmento) => clave.includes(fragmento));
}

/** Recorta un texto para que la auditoria no crezca sin control. */
export function truncate(value, max = MAX_AUDIT_VALUE) {
  const texto = String(value ?? "").trim();

  return texto.length > max ? `${texto.slice(0, max)}…` : texto;
}

/**
 * IP del cliente. En Cloudflare la cabecera fiable es `CF-Connecting-IP`; si no
 * esta (desarrollo local), se usa la primera entrada de `X-Forwarded-For`.
 *
 * @param {((nombre: string) => string | null | undefined) | null | undefined} getHeader
 */
export function extractClientIp(getHeader) {
  if (typeof getHeader !== "function") return "";

  const directa = truncate(getHeader("cf-connecting-ip"), 45);

  if (directa) return directa;

  const reenviada = String(getHeader("x-forwarded-for") ?? "").split(",")[0];

  return truncate(reenviada, 45);
}

/** User-agent recortado. */
export function extractUserAgent(getHeader) {
  if (typeof getHeader !== "function") return "";

  return truncate(getHeader("user-agent"), 300);
}

/**
 * Sanea la metadata de auditoria: descarta claves sensibles y recorta valores.
 * Fail-closed: lo que no se pueda inspeccionar o serializar, se descarta.
 *
 * @returns {Record<string, string | number | boolean> | null}
 */
export function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const limpio = {};

  for (const [clave, valor] of Object.entries(metadata)) {
    if (esClaveSensible(clave)) continue;
    if (valor === null || valor === undefined) continue;

    if (typeof valor === "number" || typeof valor === "boolean") {
      limpio[clave] = valor;
      continue;
    }

    if (typeof valor === "string") {
      limpio[clave] = truncate(valor);
      continue;
    }

    // Objetos y arreglos anidados: se serializan recortados, sin confiar en su forma.
    try {
      limpio[clave] = truncate(JSON.stringify(valor));
    } catch {
      // Se descarta lo que no se pueda serializar.
    }
  }

  return Object.keys(limpio).length > 0 ? limpio : null;
}
