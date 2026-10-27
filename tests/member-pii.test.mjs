import test from "node:test";
import assert from "node:assert/strict";
import {
  CAMPOS_NUMERO_PII,
  CAMPOS_PII,
  CAMPOS_TEXTO_PII,
  aNumeroOpcional,
  decryptPiiFields,
  decryptPiiResult,
  encryptPiiFields,
} from "../src/lib/member-pii.mjs";
import { isEncryptedField } from "../src/lib/field-crypto.mjs";

const ENV = { AUTH_SECRET: "secreto-de-prueba-para-el-cifrado-de-campos-pii" };

/** Una fila tipica de `MemberProfile` con los campos personales. */
function filaDeEjemplo() {
  return {
    id: "perfil-1",
    cedula: "V-12345678",
    nombre: "Ana",
    telefono: "0414-0000000",
    direccion: "Calle 23 con Av. 4, Merida",
    references: "Pedro Perez, 0414-1111111",
    ubicacionLat: 8.598325,
    ubicacionLng: -71.144722,
    ubicacionLink: "https://www.google.com/maps?q=8.598325,-71.144722",
    referenciaLat: 8.6,
    referenciaLng: -71.15,
    referenciaLink: "https://www.google.com/maps?q=8.600000,-71.150000",
    referencia2Lat: null,
    referencia2Lng: null,
    referencia2Link: null,
  };
}

test("cifra los 11 campos y los deja ilegibles", async () => {
  const cifrada = await encryptPiiFields(filaDeEjemplo(), ENV);

  for (const campo of CAMPOS_PII) {
    const valor = cifrada[campo];

    if (valor === null) continue;

    assert.ok(isEncryptedField(valor), `${campo} deberia estar cifrado`);
    assert.ok(!String(valor).includes("Merida"), `${campo} no puede contener el texto original`);
  }

  // El enlace lleva las coordenadas dentro: tampoco puede quedar en claro.
  assert.ok(!String(cifrada.ubicacionLink).includes("8.598325"));
  assert.ok(!String(cifrada.ubicacionLink).includes("-71.144722"));
});

test("ida y vuelta completa: los numeros vuelven como numeros", async () => {
  const original = filaDeEjemplo();
  const cifrada = await encryptPiiFields(original, ENV);
  const devuelta = await decryptPiiFields(cifrada, ENV);

  assert.equal(devuelta.direccion, original.direccion);
  assert.equal(devuelta.references, original.references);
  assert.equal(devuelta.ubicacionLink, original.ubicacionLink);

  assert.equal(typeof devuelta.ubicacionLat, "number");
  assert.equal(devuelta.ubicacionLat, original.ubicacionLat);
  assert.equal(devuelta.ubicacionLng, original.ubicacionLng);
  assert.equal(devuelta.referenciaLat, original.referenciaLat);
});

test("los campos que no son PII no se tocan", async () => {
  const cifrada = await encryptPiiFields(filaDeEjemplo(), ENV);

  assert.equal(cifrada.cedula, "V-12345678");
  assert.equal(cifrada.nombre, "Ana");
  assert.equal(cifrada.telefono, "0414-0000000");
  assert.equal(cifrada.id, "perfil-1");
});

test("solo transforma las claves presentes (semantica de update)", async () => {
  // Un update parcial: si se anadieran las claves ausentes, se sobrescribiria el dato.
  const parcial = await encryptPiiFields({ direccion: "Nueva direccion" }, ENV);

  assert.deepEqual(Object.keys(parcial), ["direccion"]);
  assert.ok(isEncryptedField(parcial.direccion));
});

test("null y vacio se guardan como null, no cifrados", async () => {
  const cifrada = await encryptPiiFields(
    { direccion: null, references: "", ubicacionLat: undefined, ubicacionLng: -71 },
    ENV,
  );

  assert.equal(cifrada.direccion, null);
  assert.equal(cifrada.references, null);
  assert.equal(cifrada.ubicacionLat, null);
  assert.ok(isEncryptedField(cifrada.ubicacionLng));
});

test("no cifra dos veces un valor ya cifrado", async () => {
  const unaVez = await encryptPiiFields({ direccion: "Calle 23" }, ENV);
  const dosVeces = await encryptPiiFields({ direccion: unaVez.direccion }, ENV);

  assert.equal(dosVeces.direccion, unaVez.direccion);

  const devuelta = await decryptPiiFields(dosVeces, ENV);

  assert.equal(devuelta.direccion, "Calle 23");
});

test("un valor heredado en claro pasa tal cual (migracion a medias)", async () => {
  const devuelta = await decryptPiiFields(filaDeEjemplo(), ENV);

  assert.equal(devuelta.direccion, "Calle 23 con Av. 4, Merida");
  // Y el numero heredado se normaliza a numero, no se queda como texto.
  assert.equal(devuelta.ubicacionLat, 8.598325);
  assert.equal(typeof devuelta.ubicacionLat, "number");
});

test("un valor ilegible queda en null, sin inventarse nada ni reventar", async () => {
  const rota = {
    direccion: "enc:v1:AAAA:BBBB",
    ubicacionLat: "enc:v1:AAAA:BBBB",
    references: "Pedro, 0414-1111111",
  };

  const devuelta = await decryptPiiFields(rota, ENV);

  assert.equal(devuelta.direccion, null);
  assert.equal(devuelta.ubicacionLat, null);
  assert.equal(devuelta.references, "Pedro, 0414-1111111");
});

test("con el secreto heredado tambien abre (rotacion sin cortes)", async () => {
  const conHeredado = await encryptPiiFields({ direccion: "Calle vieja" }, {
    AUTH_SECRET: "secreto-heredado",
  });

  const devuelta = await decryptPiiFields(conHeredado, {
    MEMBER_KEY_ENCRYPTION_SECRET: "secreto-nuevo",
    AUTH_SECRET: "secreto-heredado",
  });

  assert.equal(devuelta.direccion, "Calle vieja");
});

test("sin secreto no cifra, pero tampoco revienta", async () => {
  const salida = await encryptPiiFields({ direccion: "Calle 23" }, {});

  assert.equal(salida.direccion, "Calle 23");
});

test("decryptPiiResult maneja filas, arrays, null y valores sueltos", async () => {
  const cifrada = await encryptPiiFields({ direccion: "Calle 23" }, ENV);

  assert.equal((await decryptPiiResult(cifrada, ENV)).direccion, "Calle 23");

  const lista = await decryptPiiResult([cifrada, cifrada], ENV);

  assert.equal(lista.length, 2);
  assert.equal(lista[0].direccion, "Calle 23");

  assert.equal(await decryptPiiResult(null, ENV), null);
  assert.equal(await decryptPiiResult("texto", ENV), "texto");
});

test("aNumeroOpcional acepta numero, texto y vacios", () => {
  assert.equal(aNumeroOpcional(8.598325), 8.598325);
  assert.equal(aNumeroOpcional("8.598325"), 8.598325);
  assert.equal(aNumeroOpcional("-71.144722"), -71.144722);
  assert.equal(aNumeroOpcional(0), 0);

  assert.equal(aNumeroOpcional(null), null);
  assert.equal(aNumeroOpcional(undefined), null);
  assert.equal(aNumeroOpcional(""), null);
  assert.equal(aNumeroOpcional("no es un numero"), null);
  assert.equal(aNumeroOpcional("enc:v1:AAAA:BBBB"), null);
  assert.equal(aNumeroOpcional(NaN), null);
});

test("las listas de campos no se solapan y estan completas", () => {
  assert.equal(CAMPOS_PII.length, 11);
  assert.equal(CAMPOS_TEXTO_PII.length, 5);
  assert.equal(CAMPOS_NUMERO_PII.length, 6);

  const solapan = CAMPOS_TEXTO_PII.filter((campo) => CAMPOS_NUMERO_PII.includes(campo));

  assert.deepEqual(solapan, []);

  // Los tres pines, con sus tres campos cada uno.
  for (const prefijo of ["ubicacion", "referencia", "referencia2"]) {
    assert.ok(CAMPOS_PII.includes(`${prefijo}Lat`));
    assert.ok(CAMPOS_PII.includes(`${prefijo}Lng`));
    assert.ok(CAMPOS_PII.includes(`${prefijo}Link`));
  }
});
