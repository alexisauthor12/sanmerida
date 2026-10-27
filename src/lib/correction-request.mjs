/**
 * Solicitud de correccion de datos (derecho de rectificacion).
 *
 * `docs/SEGURIDAD_INTEGRAL.md` 10.2, punto 7: el miembro ya ve su expediente en el
 * panel; aqui puede **pedir** que se corrija un dato.
 *
 * El miembro nunca edita su expediente directamente: la solicitud queda auditada
 * (`CORRECCION_SOLICITADA`) y el equipo aplica el cambio, que a su vez queda
 * auditado como `EXPEDIENTE_UPDATE`. Asi hay rastro de quien pidio que, de quien
 * lo cambio y cuando.
 *
 * Modulo PURO: sin dependencias, para poder probarlo.
 */

/** Campos del expediente que el miembro puede pedir corregir. */
export const CAMPOS_CORREGIBLES = [
  { valor: "nombre", etiqueta: "Nombre" },
  { valor: "apellido", etiqueta: "Apellido" },
  { valor: "email", etiqueta: "Correo electrónico" },
  { valor: "telefono", etiqueta: "Teléfono" },
  { valor: "direccion", etiqueta: "Dirección" },
  { valor: "ocupacion", etiqueta: "Ocupación" },
  { valor: "empresa", etiqueta: "Empresa" },
  { valor: "ubicacion", etiqueta: "Ubicación" },
  { valor: "referencias", etiqueta: "Referencias" },
  { valor: "plan", etiqueta: "Plan o cuota" },
  { valor: "otro", etiqueta: "Otro dato" },
];

/** Longitud minima del detalle: por debajo no se entiende que hay que corregir. */
export const CORRECTION_MIN_DETAIL = 10;

/** Tope del detalle. La auditoria recorta a 200, pero el mensaje util cabe entero. */
export const CORRECTION_MAX_DETAIL = 500;

export const CORRECTION_REQUIRED_MESSAGE = `Cuéntanos qué dato está equivocado y cuál sería el correcto (mínimo ${CORRECTION_MIN_DETAIL} caracteres).`;

/** True si el campo es uno de los corregibles. */
export function isCampoCorregible(valor) {
  const campo = String(valor ?? "").trim().toLowerCase();

  return CAMPOS_CORREGIBLES.some((item) => item.valor === campo);
}

/** Etiqueta legible de un campo; devuelve el valor tal cual si no se reconoce. */
export function labelCampo(valor) {
  const campo = String(valor ?? "").trim().toLowerCase();

  return CAMPOS_CORREGIBLES.find((item) => item.valor === campo)?.etiqueta ?? campo;
}

/**
 * Valida y normaliza una solicitud de correccion.
 *
 * @param {{ campo?: unknown, detalle?: unknown }} [input]
 * @returns {{ ok: true, campo: string, etiqueta: string, detalle: string }
 *   | { ok: false, message: string }}
 */
export function buildCorrectionRequest(input = {}) {
  const campo = String(input.campo ?? "").trim().toLowerCase();
  // Se colapsan los espacios para que la auditoria no guarde relleno.
  const detalle = String(input.detalle ?? "").trim().replace(/\s+/g, " ");

  if (!isCampoCorregible(campo)) {
    return { ok: false, message: "Selecciona qué dato quieres corregir." };
  }

  if (detalle.length < CORRECTION_MIN_DETAIL) {
    return { ok: false, message: CORRECTION_REQUIRED_MESSAGE };
  }

  return {
    ok: true,
    campo,
    etiqueta: labelCampo(campo),
    detalle: detalle.slice(0, CORRECTION_MAX_DETAIL),
  };
}
