import test from "node:test";
import assert from "node:assert/strict";
import {
  detectFileType,
  toBytes,
  validateFileSignature,
} from "../src/lib/file-signature.mjs";

/** Construye bytes con una cabecera concreta. */
function bytes(...cabecera) {
  return new Uint8Array([...cabecera, ...new Array(32).fill(0)]);
}

const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37);
const BMP = bytes(0x42, 0x4d);
const TIFF_LE = bytes(0x49, 0x49, 0x2a, 0x00);
const TIFF_BE = bytes(0x4d, 0x4d, 0x00, 0x2a);
/** RIFF + tamano + "WEBP" */
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0]);
/** Contenedor ISO-BMFF con marca "ftyp" + "heic". */
const HEIC = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0]);
/** ZIP (un .docx o un .zip disfrazado). */
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04);
/** Ejecutable de Windows (MZ). */
const EXE = bytes(0x4d, 0x5a, 0x90, 0x00);
/** Script de texto plano. */
const TEXTO = new Uint8Array(Buffer.from("<?php system($_GET['c']); ?>"));
/** RIFF pero de audio (WAV), no WebP. */
const WAV = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, 0, 0, 0, 0]);

test("detectFileType reconoce los formatos permitidos", () => {
  assert.equal(detectFileType(JPEG), "jpeg");
  assert.equal(detectFileType(PNG), "png");
  assert.equal(detectFileType(PDF), "pdf");
  assert.equal(detectFileType(BMP), "bmp");
  assert.equal(detectFileType(TIFF_LE), "tiff");
  assert.equal(detectFileType(TIFF_BE), "tiff");
  assert.equal(detectFileType(WEBP), "webp");
  assert.equal(detectFileType(HEIC), "heif");
});

test("detectFileType rechaza lo que no es imagen ni PDF", () => {
  assert.equal(detectFileType(EXE), null);
  assert.equal(detectFileType(ZIP), null);
  assert.equal(detectFileType(TEXTO), null);
  // RIFF de audio: no debe confundirse con WebP.
  assert.equal(detectFileType(WAV), null);
});

test("detectFileType es seguro con entradas invalidas", () => {
  for (const entrada of [null, undefined, "", 42, {}, [], new Uint8Array(0), new Uint8Array([0xff])]) {
    assert.equal(detectFileType(entrada), null);
  }
});

test("toBytes acepta Uint8Array, ArrayBuffer y vistas", () => {
  assert.equal(toBytes(JPEG)?.length, JPEG.length);
  assert.equal(toBytes(JPEG.buffer)?.length, JPEG.length);
  assert.equal(toBytes(new DataView(JPEG.buffer))?.length, JPEG.length);
  assert.equal(toBytes("texto"), null);
  assert.equal(toBytes(null), null);
});

test("validateFileSignature acepta contenido y declaracion coherentes", () => {
  assert.equal(validateFileSignature(JPEG, { fileName: "cedula.jpg", mimeType: "image/jpeg" }).ok, true);
  assert.equal(validateFileSignature(PNG, { fileName: "foto.PNG", mimeType: "image/png" }).ok, true);
  assert.equal(validateFileSignature(PDF, { fileName: "contrato.pdf", mimeType: "application/pdf" }).ok, true);
  assert.equal(validateFileSignature(HEIC, { fileName: "foto.heic", mimeType: "image/heic" }).ok, true);
});

test("validateFileSignature acepta un MIME generico (el contenido manda)", () => {
  assert.equal(validateFileSignature(JPEG, { fileName: "foto.jpg", mimeType: "application/octet-stream" }).ok, true);
  assert.equal(validateFileSignature(PNG, { fileName: "foto.png" }).ok, true);
});

test("validateFileSignature rechaza contenido que no es imagen ni PDF", () => {
  const resultado = validateFileSignature(EXE, { fileName: "virus.jpg", mimeType: "image/jpeg" });

  assert.equal(resultado.ok, false);
  assert.match(resultado.message, /no corresponde a una imagen o PDF/);

  assert.equal(validateFileSignature(ZIP, { fileName: "doc.pdf", mimeType: "application/pdf" }).ok, false);
  assert.equal(validateFileSignature(TEXTO, { fileName: "shell.php", mimeType: "image/png" }).ok, false);
});

test("validateFileSignature rechaza cuando la extension miente sobre el contenido", () => {
  const resultado = validateFileSignature(EXE, { fileName: "foto.png", mimeType: "image/png" });

  assert.equal(resultado.ok, false);

  // Un PDF renombrado a .jpg tampoco pasa.
  const cruzado = validateFileSignature(PDF, { fileName: "foto.jpg", mimeType: "image/jpeg" });

  assert.equal(cruzado.ok, false);
  assert.match(cruzado.message, /contenido real es PDF/);
});

test("validateFileSignature rechaza cuando el MIME declarado contradice el contenido", () => {
  const resultado = validateFileSignature(PNG, { fileName: "foto.png", mimeType: "application/pdf" });

  assert.equal(resultado.ok, false);
  assert.match(resultado.message, /tipo declarado no coincide/);
});

test("validateFileSignature acepta extensiones equivalentes del mismo tipo", () => {
  assert.equal(validateFileSignature(JPEG, { fileName: "foto.jpeg", mimeType: "image/jpg" }).ok, true);
  assert.equal(validateFileSignature(TIFF_LE, { fileName: "scan.tif", mimeType: "image/tiff" }).ok, true);
  assert.equal(validateFileSignature(TIFF_LE, { fileName: "scan.tiff", mimeType: "image/tiff" }).ok, true);
});
