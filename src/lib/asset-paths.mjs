/**
 * Helpers puros (usables en cliente, servidor y tests) para las rutas de los
 * archivos de expedientes.
 *
 * Convencion de almacenamiento: cada archivo se identifica con una clave
 * relativa al bucket/raiz de almacenamiento:
 *
 *   uploads/members/<cedula>/<assettype>/<documentKey>/<variant>/<archivo>
 *
 * (sin slash inicial). Las filas antiguas de `MemberAsset.filePath` guardan la
 * misma ruta pero con slash inicial (`/uploads/...`) apuntando a `public/`;
 * `buildAssetUrl` normaliza ambos formatos hacia el endpoint protegido
 * `/api/member-files/file`, que es el unico autorizado a entregar el archivo.
 */

export const ASSET_FILE_ENDPOINT = "/api/member-files/file";
export const ASSET_KEY_PREFIX = "uploads/members/";
export const ASSET_TRASH_PREFIX = "_papelera/";

/** Tamano maximo permitido por documento (20 MB). */
export const MAX_ASSET_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * Tipos permitidos para los documentos del expediente.
 * Ojo: SVG queda fuera a proposito (puede contener scripts).
 */
export const ALLOWED_ASSET_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".bmp",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
  ".pdf",
];

export const ALLOWED_ASSET_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "image/heic",
  "image/heif",
  "application/pdf",
];

const MAX_SEGMENT_LENGTH = 64;
const EXTENSION_PATTERN = /\.[a-z0-9]{1,8}$/i;

const CONTENT_TYPE_BY_EXTENSION = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
};

/** Deja solo los digitos de una cedula. */
export function sanitizeCedulaDigits(value) {
  return String(value ?? "").replace(/[^0-9]/g, "");
}

/** Normaliza un segmento de ruta (tipo de asset, documento, variante, token). */
export function sanitizeAssetSegment(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SEGMENT_LENGTH);
}

/** Quita slashes iniciales para obtener una clave relativa canonica. */
export function normalizeStorageKey(value) {
  return String(value ?? "").trim().replace(/^\/+/, "");
}

/** Extension en minusculas (incluye el punto) o cadena vacia. */
export function extractFileExtension(fileName) {
  const match = String(fileName ?? "").trim().toLowerCase().match(EXTENSION_PATTERN);
  return match ? match[0] : "";
}

/**
 * Traduce una clave (o una fila antigua `/uploads/...`) a la URL protegida.
 * Las rutas absolutas del sitio que no son expedientes (por ejemplo las
 * imagenes de respaldo en `/Documentos/...`) se devuelven sin cambios.
 */
export function buildAssetUrl(value) {
  const raw = String(value ?? "").trim();

  if (!raw) return "";
  if (raw.startsWith(ASSET_FILE_ENDPOINT)) return raw;
  if (raw.startsWith("/") && !raw.startsWith("/uploads/")) return raw;

  return `${ASSET_FILE_ENDPOINT}?path=${encodeURIComponent(normalizeStorageKey(raw))}`;
}

/** Construye la clave destino de un archivo de expediente. */
export function buildAssetKey({
  cedula,
  assetType,
  documentKey,
  variant,
  fileName,
  now = Date.now(),
  token = "",
}) {
  const safeCedula = sanitizeCedulaDigits(cedula);
  const safeAssetType = sanitizeAssetSegment(assetType);
  const safeDocumentKey = sanitizeAssetSegment(documentKey);
  const safeVariant = sanitizeAssetSegment(variant);
  const safeToken = sanitizeAssetSegment(token) || Math.random().toString(36).slice(2, 10);
  const extension = extractFileExtension(fileName) || ".bin";

  return `${ASSET_KEY_PREFIX}${safeCedula}/${safeAssetType}/${safeDocumentKey}/${safeVariant}/${now}-${safeToken}${extension}`;
}

/** Reemplaza la extension de una clave por la indicada. */
export function replaceAssetKeyExtension(value, extension) {
  const key = normalizeStorageKey(value);

  if (!key) return "";

  const normalizedExtension = String(extension ?? "").startsWith(".")
    ? String(extension)
    : `.${extension ?? ""}`;

  return EXTENSION_PATTERN.test(key)
    ? `${key.slice(0, -extractFileExtension(key).length)}${normalizedExtension}`
    : `${key}${normalizedExtension}`;
}

/** Clave del PDF digital derivado de un escaneo. */
export function buildDerivedPdfKey(value) {
  return replaceAssetKeyExtension(value, ".pdf");
}

/** Clave del texto OCR derivado de un escaneo. */
export function buildDerivedTextKey(value) {
  return replaceAssetKeyExtension(value, ".txt");
}

/** True si la clave apunta a una imagen procesable. */
export function isImageKey(value) {
  return /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(normalizeStorageKey(value));
}

/**
 * Devuelve la cedula dueña de la clave, o "" si la clave no pertenece a un
 * expediente valido. Se usa tambien como validacion de forma de la clave para
 * impedir que el endpoint protegido sirva archivos arbitrarios de `public/`.
 */
export function extractMemberCedulaFromKey(value) {
  const key = normalizeStorageKey(value);

  if (!key.startsWith(ASSET_KEY_PREFIX)) return "";

  const [cedula] = key.slice(ASSET_KEY_PREFIX.length).split("/");

  return /^[0-9]+$/.test(cedula ?? "") ? cedula : "";
}

/** Content-Type deducido de la extension de la clave. */
export function guessContentTypeFromKey(value) {
  const extension = extractFileExtension(value);
  return CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream";
}

/** Extensiones que el endpoint protegido puede entregar (incluye el texto OCR). */
const SERVABLE_EXTENSIONS = [...ALLOWED_ASSET_EXTENSIONS, ".txt"];

/**
 * Valida un archivo antes de guardarlo (tipo y tamano). Devuelve `ok` y un
 * mensaje listo para mostrar al usuario.
 */
export function validateAssetUpload({ fileName, mimeType, size } = {}) {
  const extension = extractFileExtension(fileName);
  const normalizedMime = String(mimeType ?? "").trim().toLowerCase();

  if (!extension && !normalizedMime) {
    return { ok: false, message: "El archivo no tiene un formato reconocible." };
  }

  const typeAllowed = ALLOWED_ASSET_MIME_TYPES.includes(normalizedMime);
  const extensionAllowed = ALLOWED_ASSET_EXTENSIONS.includes(extension);

  if (!typeAllowed && !extensionAllowed) {
    return {
      ok: false,
      message: "Formato no permitido. Solo se aceptan imágenes (JPG, PNG, WEBP) o PDF.",
    };
  }

  const bytes = Number(size ?? 0);

  if (Number.isFinite(bytes) && bytes > MAX_ASSET_UPLOAD_BYTES) {
    const limitMb = Math.round(MAX_ASSET_UPLOAD_BYTES / 1024 / 1024);
    return { ok: false, message: `El archivo supera el límite de ${limitMb} MB.` };
  }

  return { ok: true, message: "" };
}

/**
 * True solo si la clave es un documento de expediente con extension permitida.
 * Es la puerta del endpoint protegido: evita servir cualquier archivo de
 * `public/` o contenido de la papelera.
 */
export function isServableAssetKey(value) {
  const key = normalizeStorageKey(value);

  if (!key || key.includes("..")) return false;
  if (key.startsWith(ASSET_TRASH_PREFIX)) return false;
  if (!extractMemberCedulaFromKey(key)) return false;

  return SERVABLE_EXTENSIONS.includes(extractFileExtension(key));
}

/** Clave destino dentro de la papelera (recuperable). */
export function buildTrashKey(value, date = new Date()) {
  const key = normalizeStorageKey(value);

  if (!key || key.startsWith(ASSET_TRASH_PREFIX)) return key;

  const day = date.toISOString().slice(0, 10);

  return `${ASSET_TRASH_PREFIX}${day}/${key}`;
}
