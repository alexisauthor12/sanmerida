import test from "node:test";
import assert from "node:assert/strict";
import {
  ASSET_FILE_ENDPOINT,
  MAX_ASSET_UPLOAD_BYTES,
  buildAssetKey,
  buildAssetUrl,
  buildDerivedPdfKey,
  buildDerivedTextKey,
  buildTrashKey,
  extractMemberCedulaFromKey,
  guessContentTypeFromKey,
  isImageKey,
  isServableAssetKey,
  normalizeStorageKey,
  replaceAssetKeyExtension,
  sanitizeAssetSegment,
  sanitizeCedulaDigits,
  validateAssetUpload,
} from "../src/lib/asset-paths.mjs";

test("sanitizeCedulaDigits deja solo digitos", () => {
  assert.equal(sanitizeCedulaDigits("V-31.033.017"), "31033017");
  assert.equal(sanitizeCedulaDigits(""), "");
});

test("sanitizeAssetSegment normaliza case, acentos y simbolos", () => {
  assert.equal(sanitizeAssetSegment("Certificado de Origen"), "certificado-de-origen");
  assert.equal(sanitizeAssetSegment("  DOCUMENT  "), "document");
  assert.equal(sanitizeAssetSegment("../../etc/passwd"), "etc-passwd");
  assert.equal(sanitizeAssetSegment(""), "");
});

test("normalizeStorageKey quita el slash inicial", () => {
  assert.equal(normalizeStorageKey("/uploads/members/1/x.jpg"), "uploads/members/1/x.jpg");
  assert.equal(normalizeStorageKey("uploads/members/1/x.jpg"), "uploads/members/1/x.jpg");
});

test("buildAssetUrl envia las claves al endpoint protegido", () => {
  const url = buildAssetUrl("uploads/members/31033017/document/identidad/normal/1-abc.jpeg");

  assert.equal(
    url,
    `${ASSET_FILE_ENDPOINT}?path=${encodeURIComponent("uploads/members/31033017/document/identidad/normal/1-abc.jpeg")}`,
  );
});

test("buildAssetUrl normaliza filas antiguas con slash inicial", () => {
  assert.equal(
    buildAssetUrl("/uploads/members/31033017/document/rif/normal/1-abc.jpeg"),
    `${ASSET_FILE_ENDPOINT}?path=${encodeURIComponent("uploads/members/31033017/document/rif/normal/1-abc.jpeg")}`,
  );
});

test("buildAssetUrl deja intactas las rutas estaticas del sitio", () => {
  assert.equal(buildAssetUrl("/Documentos/Identificacion principal.jpeg"), "/Documentos/Identificacion principal.jpeg");
  assert.equal(buildAssetUrl("/Logo.png"), "/Logo.png");
});

test("buildAssetUrl no re-envuelve una URL ya construida y soporta vacios", () => {
  const already = `${ASSET_FILE_ENDPOINT}?path=uploads%2Fmembers%2F1%2Fa.jpg`;
  assert.equal(buildAssetUrl(already), already);
  assert.equal(buildAssetUrl(""), "");
  assert.equal(buildAssetUrl(undefined), "");
});

test("buildAssetKey arma la clave del expediente con la extension original", () => {
  const key = buildAssetKey({
    cedula: "V-31.033.017",
    assetType: "DOCUMENT",
    documentKey: "Certificado de Origen",
    variant: "NORMAL",
    fileName: "Foto Cedula.PNG",
    now: 1700000000000,
    token: "abcd1234",
  });

  assert.equal(key, "uploads/members/31033017/document/certificado-de-origen/normal/1700000000000-abcd1234.png");
});

test("buildAssetKey usa .bin cuando el archivo no trae extension", () => {
  const key = buildAssetKey({
    cedula: "31033017",
    assetType: "CONTRACT",
    documentKey: "principal",
    variant: "SCANNED",
    fileName: "contrato",
    now: 1700000000000,
    token: "tok",
  });

  assert.equal(key, "uploads/members/31033017/contract/principal/scanned/1700000000000-tok.bin");
});

test("buildAssetKey no permite escapar del prefijo con rutas maliciosas", () => {
  const key = buildAssetKey({
    cedula: "31033017",
    assetType: "DOCUMENT",
    documentKey: "../../../etc/passwd",
    variant: "NORMAL",
    fileName: "a.jpg",
    now: 1700000000000,
    token: "tok",
  });

  assert.ok(key.startsWith("uploads/members/31033017/document/"));
  assert.equal(key.includes(".."), false);
});

test("buildDerivedPdfKey y buildDerivedTextKey derivan del escaneo", () => {
  const scanned = "uploads/members/1/document/identidad/scanned/1700000000000-abc.jpg";

  assert.equal(buildDerivedPdfKey(scanned), "uploads/members/1/document/identidad/scanned/1700000000000-abc.pdf");
  assert.equal(buildDerivedTextKey(scanned), "uploads/members/1/document/identidad/scanned/1700000000000-abc.txt");
});

test("replaceAssetKeyExtension agrega extension cuando no existe", () => {
  assert.equal(replaceAssetKeyExtension("uploads/members/1/a", ".pdf"), "uploads/members/1/a.pdf");
  assert.equal(replaceAssetKeyExtension("", ".pdf"), "");
});

test("extractMemberCedulaFromKey valida la forma de la clave", () => {
  assert.equal(extractMemberCedulaFromKey("uploads/members/31033017/document/identidad/normal/1-a.jpg"), "31033017");
  assert.equal(extractMemberCedulaFromKey("/uploads/members/31033017/document/identidad/normal/1-a.jpg"), "31033017");
  assert.equal(extractMemberCedulaFromKey("uploads/members/../secret.txt"), "");
  assert.equal(extractMemberCedulaFromKey("/Documentos/Identificacion principal.jpeg"), "");
  assert.equal(extractMemberCedulaFromKey("uploads/members/"), "");
  assert.equal(extractMemberCedulaFromKey(""), "");
});

test("guessContentTypeFromKey deduce el tipo por extension", () => {
  assert.equal(guessContentTypeFromKey("uploads/members/1/document/selfie/normal/a.jpg"), "image/jpeg");
  assert.equal(guessContentTypeFromKey("uploads/members/1/document/identidad/normal/a.PNG"), "image/png");
  assert.equal(guessContentTypeFromKey("uploads/members/1/document/rif/scanned/a.pdf"), "application/pdf");
  assert.equal(guessContentTypeFromKey("uploads/members/1/document/rif/scanned/a.txt"), "text/plain; charset=utf-8");
  assert.equal(guessContentTypeFromKey("uploads/members/1/document/rif/normal/a.bin"), "application/octet-stream");
});

test("isImageKey reconoce imagenes procesables", () => {
  assert.equal(isImageKey("uploads/members/1/document/identidad/normal/a.jpeg"), true);
  assert.equal(isImageKey("uploads/members/1/document/identidad/scanned/a.pdf"), false);
});

test("validateAssetUpload acepta imagenes y PDF dentro del limite", () => {
  assert.equal(validateAssetUpload({ fileName: "cedula.jpg", mimeType: "image/jpeg", size: 1024 }).ok, true);
  assert.equal(validateAssetUpload({ fileName: "cedula.png", mimeType: "image/png", size: 1024 }).ok, true);
  assert.equal(validateAssetUpload({ fileName: "contrato.pdf", mimeType: "application/pdf", size: 1024 }).ok, true);
  assert.equal(validateAssetUpload({ fileName: "foto", mimeType: "image/jpeg", size: 1024 }).ok, true);
});

test("validateAssetUpload rechaza formatos peligrosos", () => {
  for (const fileName of ["virus.exe", "pagina.html", "script.svg", "datos.json", "shell.sh", "app.js"]) {
    const result = validateAssetUpload({ fileName, mimeType: "application/octet-stream", size: 1024 });

    assert.equal(result.ok, false, `${fileName} no deberia permitirse`);
    assert.ok(result.message.length > 0);
  }
});

test("validateAssetUpload rechaza archivos demasiado grandes", () => {
  const result = validateAssetUpload({
    fileName: "foto.jpg",
    mimeType: "image/jpeg",
    size: MAX_ASSET_UPLOAD_BYTES + 1,
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /límite/i);
});

test("isServableAssetKey solo permite documentos del expediente", () => {
  assert.equal(isServableAssetKey("uploads/members/31033017/document/identidad/normal/a.jpg"), true);
  assert.equal(isServableAssetKey("/uploads/members/31033017/document/rif/scanned/a.pdf"), true);
  assert.equal(isServableAssetKey("uploads/members/31033017/document/rif/scanned/a.txt"), true);
  assert.equal(isServableAssetKey("uploads/members/31033017/document/rif/normal/a.svg"), false);
  assert.equal(isServableAssetKey("uploads/members/31033017/document/rif/normal/a.html"), false);
  assert.equal(isServableAssetKey("_papelera/2026-10-20/uploads/members/1/document/rif/normal/a.jpg"), false);
  assert.equal(isServableAssetKey("/Documentos/Identificacion principal.jpeg"), false);
  assert.equal(isServableAssetKey("uploads/members/../secret.jpg"), false);
});

test("buildTrashKey mueve a papelera con fecha y es idempotente", () => {
  const key = "uploads/members/1/document/identidad/normal/a.jpg";
  const trashed = buildTrashKey(key, new Date("2026-10-20T12:00:00.000Z"));

  assert.equal(trashed, "_papelera/2026-10-20/uploads/members/1/document/identidad/normal/a.jpg");
  assert.equal(buildTrashKey(trashed, new Date("2026-10-21T12:00:00.000Z")), trashed);
});
