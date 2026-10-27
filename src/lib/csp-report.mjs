/**
 * Informes de violacion de CSP (`docs/SEGURIDAD_INTEGRAL.md` 9.1).
 *
 * La politica estricta (sin `unsafe-inline`) viaja en **modo informe**: el navegador
 * la evalua y manda un informe de lo que habria bloqueado, sin bloquearlo. Eso es lo
 * unico que permite saber que romperia activarla de verdad.
 *
 * Los navegadores usan dos formatos:
 *   - `application/csp-report` (clasico): `{ "csp-report": { ... } }`
 *   - `application/reports+json` (Reporting API): `[{ type: "csp-violation", body: {...} }]`
 *
 * El contenido lo controla el navegador del visitante, es decir, cualquiera: aqui
 * solo se conservan campos de una **lista cerrada**, con tope de longitud, y se
 * descarta todo lo demas. Nada de lo que llegue se ejecuta ni se devuelve.
 *
 * Modulo PURO: sin dependencias, para poder probarlo.
 */

/** Tope de longitud por campo. Un informe es telemetria, no un documento. */
export const MAX_CSP_FIELD = 300;

/** Tope de informes que se aceptan de una sola peticion. */
export const MAX_CSP_REPORTS_PER_REQUEST = 20;

/**
 * Forma normalizada de un informe: exactamente los campos que se guardan.
 *
 * @typedef {object} CspReportRecord
 * @property {string} directive
 * @property {string | null} blockedUri
 * @property {string | null} documentUri
 * @property {string | null} sourceFile
 * @property {number | null} lineNumber
 * @property {number | null} columnNumber
 * @property {string} disposition
 */

/** Nombres alternativos de cada campo (clasico y Reporting API). */
const ALIAS = {
  directive: ["effective-directive", "effectiveDirective", "violated-directive", "violatedDirective"],
  blockedUri: ["blocked-uri", "blockedURL"],
  documentUri: ["document-uri", "documentURL"],
  sourceFile: ["source-file", "sourceFile"],
  lineNumber: ["line-number", "lineNumber"],
  columnNumber: ["column-number", "columnNumber"],
  disposition: ["disposition"],
};

function limpiar(valor) {
  const texto = String(valor ?? "").trim();

  return texto.length > MAX_CSP_FIELD ? texto.slice(0, MAX_CSP_FIELD) : texto;
}

function leerCampo(origen, claves) {
  for (const clave of claves) {
    const valor = origen[clave];

    if (valor !== undefined && valor !== null && valor !== "") {
      return limpiar(valor);
    }
  }

  return "";
}

function leerNumero(origen, claves) {
  const texto = leerCampo(origen, claves);
  const numero = Number.parseInt(texto, 10);

  return Number.isFinite(numero) ? numero : null;
}

/**
 * Normaliza un informe crudo a la forma que se guarda.
 * @param {unknown} origen
 * @returns {CspReportRecord | null} null si no hay directiva (sin ella no hay nada que analizar).
 */
export function normalizeCspReport(origen) {
  if (!origen || typeof origen !== "object" || Array.isArray(origen)) return null;

  const informe = {
    directive: leerCampo(origen, ALIAS.directive),
    blockedUri: leerCampo(origen, ALIAS.blockedUri) || null,
    documentUri: leerCampo(origen, ALIAS.documentUri) || null,
    sourceFile: leerCampo(origen, ALIAS.sourceFile) || null,
    lineNumber: leerNumero(origen, ALIAS.lineNumber),
    columnNumber: leerNumero(origen, ALIAS.columnNumber),
    disposition: leerCampo(origen, ALIAS.disposition) || "report",
  };

  return informe.directive ? informe : null;
}

/**
 * Acepta el cuerpo crudo de cualquiera de los dos formatos y devuelve la lista
 * normalizada (puede estar vacia).
 *
 * @param {unknown} payload
 * @returns {CspReportRecord[]}
 */
export function parseCspReports(payload) {
  const crudos = [];

  if (Array.isArray(payload)) {
    for (const item of payload) {
      // Reporting API: se ignora cualquier cosa que no sea una violacion de CSP.
      if (item?.type && item.type !== "csp-violation") continue;
      if (item?.body) crudos.push(item.body);
    }
  } else if (payload && typeof payload === "object") {
    // Clasico: envuelto en "csp-report"; algunos navegadores lo mandan plano.
    crudos.push(payload["csp-report"] ?? payload);
  }

  return crudos
    .slice(0, MAX_CSP_REPORTS_PER_REQUEST)
    .map(normalizeCspReport)
    .filter((informe) => informe !== null);
}
