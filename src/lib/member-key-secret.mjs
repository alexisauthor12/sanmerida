/**
 * Resolucion del secreto que cifra las credenciales de miembro.
 *
 * `AUTH_SECRET` se usa hoy para DOS cosas distintas: firmar las sesiones y cifrar
 * las claves `SAN-MEMBER-XXXXXX`. Eso tiene dos consecuencias malas:
 *
 *  1. Filtrar `AUTH_SECRET` no solo permite falsificar sesiones: expone ademas las
 *     credenciales de **todos** los miembros.
 *  2. Rotar la firma de sesiones obligaria a recifrar todas las credenciales.
 *
 * Este modulo separa ambos usos con una transicion sin cortes
 * (`docs/SEGURIDAD_INTEGRAL.md` 13.7):
 *
 *  - Se cifra **siempre** con `MEMBER_KEY_ENCRYPTION_SECRET`; mientras ese secreto
 *    no exista, se sigue usando `AUTH_SECRET`.
 *  - Al descifrar se prueba el secreto activo y, si falla, el heredado. Asi las
 *    filas antiguas siguen abriendo hasta que se ejecuta
 *    `scripts/rotate-member-key-secret.mjs`.
 *
 * Modulo puro: recibe el entorno como parametro para poder probarlo.
 */
import { decryptMemberKey, encryptMemberKey } from "./member-credentials.mjs";

/** Secreto propio del cifrado de credenciales. */
export const MEMBER_KEY_SECRET_ENV = "MEMBER_KEY_ENCRYPTION_SECRET";

/** Secreto heredado, vigente mientras dure la transicion. */
export const MEMBER_KEY_LEGACY_ENV = "AUTH_SECRET";

function entornoPorDefecto() {
  return typeof process !== "undefined" && process.env ? process.env : {};
}

function limpiar(valor) {
  return String(valor ?? "").trim().replace(/^['"]|['"]$/g, "");
}

/**
 * Secretos disponibles, en orden de preferencia.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ activo: string, heredado: string, separado: boolean }}
 *   `separado` indica si ya existe un secreto propio (es decir, si la rotacion ya
 *   se puede ejecutar).
 */
export function resolveMemberKeySecrets(env = entornoPorDefecto()) {
  const nuevo = limpiar(env[MEMBER_KEY_SECRET_ENV]);
  const heredado = limpiar(env[MEMBER_KEY_LEGACY_ENV]);

  if (nuevo) {
    return { activo: nuevo, heredado, separado: true };
  }

  // Sin secreto propio se sigue usando AUTH_SECRET: nada se rompe antes de la
  // rotacion. Pero entonces ambos usos siguen compartiendo clave.
  return { activo: heredado, heredado: "", separado: false };
}

/**
 * Cifra una clave de miembro con el secreto activo.
 * @returns {Promise<string | null>}
 */
export async function encryptMemberKeyWithEnv(plainKey, env = entornoPorDefecto()) {
  const { activo } = resolveMemberKeySecrets(env);

  return encryptMemberKey(plainKey, activo);
}

/**
 * Descifra una clave de miembro probando el secreto activo y luego el heredado.
 * @returns {Promise<string | null>} null si ningun secreto disponible la abre.
 */
export async function decryptMemberKeyWithEnv(cipherText, env = entornoPorDefecto()) {
  const { activo, heredado } = resolveMemberKeySecrets(env);

  const conActivo = await decryptMemberKey(cipherText, activo);

  if (conActivo !== null) return conActivo;

  if (heredado && heredado !== activo) {
    return decryptMemberKey(cipherText, heredado);
  }

  return null;
}
