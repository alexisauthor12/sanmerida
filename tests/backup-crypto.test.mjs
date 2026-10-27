import test from "node:test";
import assert from "node:assert/strict";
import {
  BACKUP_ALGORITHM,
  BACKUP_FORMAT,
  DEFAULT_ITERATIONS,
  MIN_PASSPHRASE_LENGTH,
  decryptBackup,
  describeBackup,
  encryptBackup,
  isEncryptedBackup,
  isValidPassphrase,
  parseEnvelope,
  toBytes,
} from "../src/lib/backup-crypto.mjs";

const CLAVE = "contrasena-de-respaldo-larga-2026";
// Iteraciones bajas: PBKDF2 con 250.000 tarda ~0,3 s y aqui se prueba el formato,
// no el coste. El valor real de produccion es `DEFAULT_ITERATIONS`.
const RAPIDO = { iteraciones: 1000 };

function texto(valor) {
  return new TextEncoder().encode(valor);
}

test("isValidPassphrase exige la longitud minima", () => {
  assert.equal(isValidPassphrase(CLAVE), true);
  assert.equal(isValidPassphrase("x".repeat(MIN_PASSPHRASE_LENGTH)), true);
  assert.equal(isValidPassphrase("x".repeat(MIN_PASSPHRASE_LENGTH - 1)), false);
  assert.equal(isValidPassphrase(""), false);
  assert.equal(isValidPassphrase(null), false);
  assert.equal(isValidPassphrase(undefined), false);
});

test("el coste por defecto es alto de verdad", () => {
  assert.ok(DEFAULT_ITERATIONS >= 200000, "PBKDF2 deberia ser costoso");
});

test("cifrar y descifrar devuelve el contenido original", async () => {
  const original = texto('{"usuarios":[{"email":"a@b.com"}]}');
  const sobre = await encryptBackup(original, CLAVE, RAPIDO);
  const claro = await decryptBackup(sobre, CLAVE);

  assert.deepEqual(Array.from(claro), Array.from(original));
});

test("el respaldo cifrado no contiene el contenido en claro", async () => {
  const sobre = await encryptBackup(texto("CEDULA-SECRETA-31033017"), CLAVE, RAPIDO);
  const comoTexto = new TextDecoder().decode(sobre);

  assert.ok(!comoTexto.includes("CEDULA-SECRETA"));
  assert.ok(!comoTexto.includes("31033017"));
});

test("el sobre es un JSON inspeccionable sin contrasena", async () => {
  const sobre = await encryptBackup(texto("datos"), CLAVE, RAPIDO);
  const meta = describeBackup(sobre);

  assert.equal(meta.formato, BACKUP_FORMAT);
  assert.equal(meta.algoritmo, BACKUP_ALGORITHM);
  assert.equal(meta.kdf, "PBKDF2-SHA256");
  assert.equal(meta.iteraciones, 1000);

  const crudo = JSON.parse(new TextDecoder().decode(sobre));

  assert.equal(typeof crudo.salt, "string");
  assert.equal(typeof crudo.iv, "string");
  assert.equal(typeof crudo.datos, "string");
});

test("dos cifrados del mismo contenido no se parecen", async () => {
  const primero = await encryptBackup(texto("mismo contenido"), CLAVE, RAPIDO);
  const segundo = await encryptBackup(texto("mismo contenido"), CLAVE, RAPIDO);

  assert.notDeepEqual(Array.from(primero), Array.from(segundo));

  // Y sin embargo los dos abren.
  assert.deepEqual(
    Array.from(await decryptBackup(primero, CLAVE)),
    Array.from(await decryptBackup(segundo, CLAVE)),
  );
});

test("una contrasena incorrecta no abre el respaldo", async () => {
  const sobre = await encryptBackup(texto("contenido"), CLAVE, RAPIDO);

  await assert.rejects(
    () => decryptBackup(sobre, "otra-contrasena-igual-de-larga"),
    /contraseña incorrecta o respaldo alterado/,
  );
});

test("un byte alterado invalida el respaldo (AES-GCM autentica)", async () => {
  const sobre = await encryptBackup(texto("contenido importante"), CLAVE, RAPIDO);
  const crudo = JSON.parse(new TextDecoder().decode(sobre));
  const datos = Buffer.from(crudo.datos, "base64");

  datos[0] ^= 0xff;
  crudo.datos = datos.toString("base64");

  await assert.rejects(
    () => decryptBackup(texto(JSON.stringify(crudo)), CLAVE),
    /contraseña incorrecta o respaldo alterado/,
  );
});

test("alterar el iv tambien invalida el respaldo", async () => {
  const sobre = await encryptBackup(texto("contenido"), CLAVE, RAPIDO);
  const crudo = JSON.parse(new TextDecoder().decode(sobre));

  crudo.iv = Buffer.from("0123456789ab", "utf8").toString("base64");

  await assert.rejects(() => decryptBackup(texto(JSON.stringify(crudo)), CLAVE));
});

test("cifrar exige contrasena suficiente y datos", async () => {
  await assert.rejects(() => encryptBackup(texto("datos"), "corta", RAPIDO), /al menos 16/);
  await assert.rejects(() => encryptBackup(texto("datos"), "", RAPIDO), /al menos 16/);
  await assert.rejects(() => encryptBackup(new Uint8Array(0), CLAVE, RAPIDO), /No hay datos/);
  await assert.rejects(() => encryptBackup(null, CLAVE, RAPIDO), /No hay datos/);
});

test("descifrar tambien exige una contrasena valida", async () => {
  const sobre = await encryptBackup(texto("datos"), CLAVE, RAPIDO);

  await assert.rejects(() => decryptBackup(sobre, "corta"), /al menos 16/);
});

test("isEncryptedBackup distingue un respaldo de un JSON normal", async () => {
  const sobre = await encryptBackup(texto("datos"), CLAVE, RAPIDO);

  assert.equal(isEncryptedBackup(sobre), true);
  assert.equal(isEncryptedBackup('{"usuarios":[]}'), false);
  assert.equal(isEncryptedBackup("no es json"), false);
  assert.equal(isEncryptedBackup(""), false);
  assert.equal(isEncryptedBackup(null), false);
  assert.equal(isEncryptedBackup('{"formato":"otro"}'), false);
});

test("parseEnvelope rechaza sobres incompletos", () => {
  assert.throws(() => parseEnvelope('{"formato":"san-backup-v1"}'), /formato de respaldo/);
  assert.throws(
    () => parseEnvelope('{"formato":"san-backup-v1","salt":"a","iv":"b"}'),
    /formato de respaldo/,
  );
  assert.throws(() => parseEnvelope("[]"), /formato de respaldo/);
});

test("un respaldo grande (1 MB) hace ida y vuelta", async () => {
  const grande = new Uint8Array(1024 * 1024);

  // `getRandomValues` tope 65.536 bytes por llamada: se rellena por trozos.
  for (let indice = 0; indice < grande.length; indice += 65536) {
    crypto.getRandomValues(grande.subarray(indice, Math.min(indice + 65536, grande.length)));
  }

  const sobre = await encryptBackup(grande, CLAVE, RAPIDO);
  const claro = await decryptBackup(sobre, CLAVE);

  assert.equal(claro.length, grande.length);
  assert.deepEqual(Array.from(claro.subarray(0, 64)), Array.from(grande.subarray(0, 64)));
});

test("toBytes acepta Uint8Array, ArrayBuffer y vistas", () => {
  const original = new Uint8Array([1, 2, 3]);

  assert.equal(toBytes(original)?.length, 3);
  assert.equal(toBytes(original.buffer)?.length, 3);
  assert.equal(toBytes(new DataView(original.buffer))?.length, 3);
  assert.equal(toBytes("texto"), null);
  assert.equal(toBytes(null), null);
});
