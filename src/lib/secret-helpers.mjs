/**
 * Resolucion de secretos de firma y cifrado.
 *
 * Modulo PURO (sin Next, sin base de datos) para poder probarlo, igual que
 * `authz.mjs` o `security-helpers.mjs`.
 *
 * Principio: **fail-closed**. Si falta un secreto, la operacion que lo necesita
 * falla de forma explicita. Nunca se asume un valor por defecto.
 */

/** Longitud minima recomendada para los secretos de firma. */
export const MIN_SECRET_LENGTH = 32;

const MISSING_AUTH_SECRET =
  "AUTH_SECRET no esta configurado. Definelo en .env.local (desarrollo) o con " +
  "`wrangler secret put AUTH_SECRET` (produccion). Sin el no se pueden firmar sesiones.";

/**
 * Resuelve el secreto de firma de los JWT.
 *
 * Fail-closed: si el valor viene vacio, **lanza**. Antes, fuera de produccion se
 * usaba un secreto de desarrollo escrito en el propio repositorio, lo que permitia
 * forjar un token de administrador cuando un despliegue quedaba con `NODE_ENV` sin
 * definir (ver `docs/SEGURIDAD_INTEGRAL.md`, hallazgo C).
 *
 * @param {unknown} value valor crudo de la variable de entorno.
 * @param {{ warn?: (mensaje: string) => void }} [opciones] receptor de avisos.
 * @returns {string} el secreto recortado.
 */
export function resolveAuthSecret(value, opciones = {}) {
  const secret = String(value ?? "").trim();

  if (!secret) {
    throw new Error(MISSING_AUTH_SECRET);
  }

  if (secret.length < MIN_SECRET_LENGTH) {
    const warn = opciones.warn;

    if (typeof warn === "function") {
      warn(
        `AUTH_SECRET es corto (${secret.length} caracteres); se recomiendan al menos ${MIN_SECRET_LENGTH}.`,
      );
    }
  }

  return secret;
}

/** True si el secreto cumple la longitud minima recomendada. */
export function isStrongSecret(value) {
  return String(value ?? "").trim().length >= MIN_SECRET_LENGTH;
}
