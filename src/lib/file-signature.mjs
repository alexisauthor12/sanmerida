/**
 * Deteccion del tipo REAL de un archivo a partir de sus primeros bytes.
 *
 * La extension y el `Content-Type` los controla quien sube el archivo: **no son
 * prueba de nada**. Un ejecutable renombrado a `.jpg` pasaba las comprobaciones
 * anteriores (extension + mime declarado). Esta verificacion mira la firma binaria
 * (magic bytes) para confirmar que el contenido corresponde a lo declarado.
 *
 * Modulo PURO: sin dependencias, para poder probarlo.
 */

/** Firmas conocidas. `offset` es la posicion donde debe empezar la secuencia. */
const FIRMAS = [
  { tipo: "jpeg", offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { tipo: "png", offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // "%PDF-"
  { tipo: "pdf", offset: 0, bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { tipo: "bmp", offset: 0, bytes: [0x42, 0x4d] },
  { tipo: "tiff", offset: 0, bytes: [0x49, 0x49, 0x2a, 0x00] },
  { tipo: "tiff", offset: 0, bytes: [0x4d, 0x4d, 0x00, 0x2a] },
  // Contenedor RIFF; se confirma con "WEBP" en el byte 8.
  { tipo: "webp", offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
  // Contenedor ISO-BMFF (HEIC/HEIF): marca "ftyp" en el byte 4.
  { tipo: "heif", offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },
];

const MARCA_WEBP = [0x57, 0x45, 0x42, 0x50];

/** Extensiones validas por tipo detectado. */
const EXTENSIONES_POR_TIPO = {
  jpeg: [".jpg", ".jpeg"],
  png: [".png"],
  webp: [".webp"],
  bmp: [".bmp"],
  tiff: [".tif", ".tiff"],
  heif: [".heic", ".heif"],
  pdf: [".pdf"],
};

/** MIME validos por tipo detectado. */
const MIMES_POR_TIPO = {
  jpeg: ["image/jpeg", "image/jpg"],
  png: ["image/png"],
  webp: ["image/webp"],
  bmp: ["image/bmp"],
  tiff: ["image/tiff"],
  heif: ["image/heic", "image/heif"],
  pdf: ["application/pdf"],
};

/**
 * MIME que NO contradicen nada: algunos navegadores y clientes no reconocen el
 * tipo y mandan un generico. El contenido ya se valido, asi que se aceptan.
 */
const MIMES_NEUTROS = ["", "application/octet-stream", "binary/octet-stream"];

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

function coincide(bytes, firma) {
  if (bytes.length < firma.offset + firma.bytes.length) return false;

  return firma.bytes.every((valor, indice) => bytes[firma.offset + indice] === valor);
}

/**
 * Detecta el tipo real del archivo.
 * @returns {string | null} "jpeg" | "png" | "webp" | "bmp" | "tiff" | "heif" | "pdf"
 */
export function detectFileType(bytes) {
  const datos = toBytes(bytes);

  if (!datos || datos.length < 4) return null;

  for (const firma of FIRMAS) {
    if (!coincide(datos, firma)) continue;

    // RIFF tambien lo usan WAV y AVI: hay que confirmar que es WebP.
    if (firma.tipo === "webp") {
      const esWebp = MARCA_WEBP.every((valor, indice) => datos[8 + indice] === valor);

      if (!esWebp) continue;
    }

    return firma.tipo;
  }

  return null;
}

/**
 * Comprueba que el contenido REAL coincide con lo que declara el archivo.
 *
 * @param {Uint8Array | ArrayBuffer} bytes primeros bytes (basta con unos cientos).
 * @param {{ fileName?: string, mimeType?: string }} [declarado]
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validateFileSignature(bytes, declarado = {}) {
  const tipo = detectFileType(bytes);

  if (!tipo) {
    return {
      ok: false,
      message: "El contenido del archivo no corresponde a una imagen o PDF válido.",
    };
  }

  const extension = (String(declarado.fileName ?? "").toLowerCase().match(/\.[a-z0-9]+$/) ?? [""])[0];
  const mime = String(declarado.mimeType ?? "").trim().toLowerCase();

  const extensiones = EXTENSIONES_POR_TIPO[tipo] ?? [];

  if (extension && !extensiones.includes(extension)) {
    return {
      ok: false,
      message: `El archivo dice ser "${extension}" pero su contenido real es ${tipo.toUpperCase()}.`,
    };
  }

  if (!MIMES_NEUTROS.includes(mime) && !(MIMES_POR_TIPO[tipo] ?? []).includes(mime)) {
    return {
      ok: false,
      message: "El tipo declarado no coincide con el contenido real del archivo.",
    };
  }

  return { ok: true };
}
