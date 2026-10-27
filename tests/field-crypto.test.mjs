import test from "node:test";
import assert from "node:assert/strict";
import {
  PII_PREFIX,
  decryptField,
  decryptFieldWithFallback,
  encryptField,
  isEncryptedField,
} from "../src/lib/field-crypto.mjs";

const SECRETO = "un-secreto-de-prueba-suficientemente-largo";
const OTRO = "otro-secreto-distinto-igual-de-largo";

test("cifra y descifra un texto (ida y vuelta)", async () => {
  const cifrado = await encryptField("Calle 23 con Av. 4, Merida", SECRETO, "direccion");

  assert.notEqual(cifrado, "Calle 23 con Av. 4, Merida");
  assert.equal(await decryptField(cifrado, SECRETO, "direccion"), "Calle 23 con Av. 4, Merida");
});

test("el valor cifrado lleva el formato documentado", async () => {
  const cifrado = await encryptField("hola", SECRETO, "direccion");

  assert.ok(cifrado.startsWith(PII_PREFIX), "debe empezar por enc:v1:");

  const partes = cifrado.slice(PII_PREFIX.length).split(":");

  assert.equal(partes.length, 2, "iv y cifrado");
  assert.ok(partes[0].length > 0 && partes[1].length > 0);
});

test("cada cifrado usa un IV distinto (mismo texto, distinto resultado)", async () => {
  const primero = await encryptField("mismo texto", SECRETO, "direccion");
  const segundo = await encryptField("mismo texto", SECRETO, "direccion");

  assert.notEqual(primero, segundo, "dos cifrados del mismo texto no pueden coincidir");

  // Pero los dos abren al mismo original.
  assert.equal(await decryptField(primero, SECRETO, "direccion"), "mismo texto");
  assert.equal(await decryptField(segundo, SECRETO, "direccion"), "mismo texto");
});

test("con otro secreto no abre", async () => {
  const cifrado = await encryptField("secreto", SECRETO, "direccion");

  assert.equal(await decryptField(cifrado, OTRO, "direccion"), null);
});

test("el cifrado de un campo no vale para otro (dato asociado)", async () => {
  const deDireccion = await encryptField("V-12345678", SECRETO, "direccion");

  // Pegarlo en otro campo debe fallar: GCM comprueba el AAD.
  assert.equal(await decryptField(deDireccion, SECRETO, "references"), null);
  assert.equal(await decryptField(deDireccion, SECRETO, "direccion"), "V-12345678");
});

test("isEncryptedField distingue lo cifrado de lo heredado", async () => {
  assert.equal(isEncryptedField(await encryptField("x", SECRETO, "direccion")), true);
  assert.equal(isEncryptedField("Calle 23, Merida"), false);
  assert.equal(isEncryptedField(null), false);
  assert.equal(isEncryptedField(undefined), false);
  assert.equal(isEncryptedField(42), false);
});

test("decryptField devuelve null con valores que no son suyos", async () => {
  for (const valor of ["texto en claro", "", "enc:v2:algo", "enc:v1:solo-una-parte", "enc:v1:a:b:c"]) {
    assert.equal(await decryptField(valor, SECRETO, "direccion"), null, JSON.stringify(valor));
  }
});

test("decryptField nunca lanza, ni con basura", async () => {
  for (const valor of ["enc:v1:!!!:???", "enc:v1:" + "a".repeat(200) + ":b", "enc:v1::"]) {
    assert.equal(await decryptField(valor, SECRETO, "direccion"), null);
  }
});

test("sobrevive a acentos, emojis y saltos de linea", async () => {
  for (const original of ["Calle José María #4-56", "🏍️ San Mérida", "linea1\nlinea2\ttab"]) {
    const cifrado = await encryptField(original, SECRETO, "direccion");

    assert.equal(await decryptField(cifrado, SECRETO, "direccion"), original);
  }
});

test("decryptFieldWithFallback prueba el activo y luego el heredado", async () => {
  const conHeredado = await encryptField("valor antiguo", OTRO, "direccion");

  // El activo no lo abre, el heredado si.
  assert.equal(await decryptFieldWithFallback(conHeredado, [SECRETO, OTRO], "direccion"), "valor antiguo");
  assert.equal(await decryptFieldWithFallback(conHeredado, [SECRETO], "direccion"), null);
});

test("decryptFieldWithFallback ignora los secretos vacios", async () => {
  const cifrado = await encryptField("valor", SECRETO, "direccion");

  assert.equal(
    await decryptFieldWithFallback(cifrado, ["", undefined, null, SECRETO], "direccion"),
    "valor",
  );
});

test("la clave esta separada por contexto: no es la del secreto en crudo", async () => {
  // Dos contextos distintos del mismo modulo no deben interoperar. Aqui se comprueba
  // que un valor cifrado sin campo (cadena vacia) no abre con otro campo, que es la
  // manifestacion visible de esa separacion.
  const sinCampo = await encryptField("valor", SECRETO, "");

  assert.equal(await decryptField(sinCampo, SECRETO, "direccion"), null);
  assert.equal(await decryptField(sinCampo, SECRETO, ""), "valor");
});
