/**
 * Aviso de tratamiento de datos y consentimiento
 * (`docs/SEGURIDAD_INTEGRAL.md` 10.2, punto 6).
 *
 * El texto vive **aqui**, no en la interfaz, para que la version que se guarda en
 * la base corresponda exactamente al texto que se mostro. Si el aviso cambia, se
 * cambia `CONSENT_VERSION` y los consentimientos anteriores quedan registrados con
 * la version que el titular acepto en su momento.
 *
 * El contenido es una base tecnica coherente con lo que el sistema hace de verdad:
 * debe revisarlo el responsable legal antes de considerarlo definitivo.
 *
 * Modulo PURO: sin dependencias, para poder probarlo.
 */

/** Version vigente del aviso. **Cambiarla cada vez que cambie el texto.** */
export const CONSENT_VERSION = "2026-10";

/** Mensaje unico de fallo: el registro no avanza sin consentimiento. */
export const CONSENT_REQUIRED_MESSAGE =
  "Debes leer y aceptar el aviso de tratamiento de datos para continuar.";

export const AVISO_TRATAMIENTO_DATOS = {
  version: CONSENT_VERSION,
  titulo: "Tratamiento de tus datos personales",
  intro: "Antes de registrar tus datos, esto es lo que hacemos con ellos y por qué.",
  secciones: [
    {
      titulo: "Quién los trata",
      texto:
        "SAN Mérida, como responsable del tratamiento de los datos de sus miembros y clientes.",
    },
    {
      titulo: "Para qué",
      puntos: [
        "Gestionar tu expediente y tu contrato de financiamiento.",
        "Administrar tus cuotas, pagos y abonos.",
        "Identificarte y proteger tu cuenta (verificación en dos pasos y registro de accesos).",
        "Contactarte por asuntos relacionados con el servicio.",
      ],
    },
    {
      titulo: "Qué datos",
      puntos: [
        "Identificación: cédula, nombre y RIF.",
        "Contacto: teléfono, correo y dirección.",
        "Ubicación: coordenadas y referencias que aportas.",
        "Documentos e imágenes que entregas (cédula, contrato, fotos).",
        "Información financiera de tu plan: cuotas, pagos y montos.",
      ],
    },
    {
      titulo: "Cuánto tiempo",
      puntos: [
        "Tu expediente, mientras dure la relación contractual y lo exija la normativa.",
        "Los documentos borrados van a una papelera de 30 días antes de eliminarse.",
        "Los registros de acceso a tu expediente se conservan entre 1 y 2 años y luego se purgan.",
      ],
    },
    {
      titulo: "Tus derechos",
      puntos: [
        "Ver qué datos tenemos de ti: están en tu panel, en cualquier momento.",
        "Pedir la corrección de un dato equivocado.",
        "Saber quién ha consultado tu expediente: cada acceso queda registrado.",
      ],
    },
    {
      titulo: "Cómo lo protegemos",
      puntos: [
        "Solo el equipo con rol administrativo y licencia validada puede abrir tu expediente.",
        "Tus documentos viven en un almacenamiento privado, no en una carpeta pública.",
        "Cada consulta, cambio o descarga de tu expediente queda auditada con fecha, usuario e IP.",
        "Las credenciales de tu cuenta se guardan cifradas.",
      ],
    },
  ],
  textoConsentimiento:
    "He leído el aviso y autorizo a SAN Mérida a tratar mis datos personales para las finalidades descritas.",
};

/** Estados que cuentan como consentimiento. Todo lo demas se rechaza. */
const ACEPTADO = new Set([true, 1, "1", "true", "on", "si", "sí", "acepto"]);

/** True solo si el valor del formulario es un consentimiento explicito. */
export function isConsentAccepted(value) {
  if (typeof value === "string") {
    return ACEPTADO.has(value.trim().toLowerCase());
  }

  return ACEPTADO.has(value);
}

/**
 * Registro de consentimiento listo para guardar.
 *
 * @param {{ accepted?: unknown, version?: string, now?: Date }} [input]
 * @returns {{ consentimientoVersion: string, consentimientoAceptadoAt: Date } | null}
 *   null si no hay consentimiento: quien llama debe rechazar la operacion.
 */
export function buildConsentRecord(input = {}) {
  const { accepted, version = CONSENT_VERSION, now = new Date() } = input;

  if (!isConsentAccepted(accepted)) return null;

  return { consentimientoVersion: version, consentimientoAceptadoAt: now };
}

/**
 * True si el consentimiento guardado corresponde al aviso vigente.
 * Sirve para pedir una nueva aceptacion cuando el texto cambie.
 */
export function isConsentUpToDate(record, version = CONSENT_VERSION) {
  return String(record?.consentimientoVersion ?? "") === version;
}
