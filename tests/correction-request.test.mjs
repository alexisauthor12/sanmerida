import test from "node:test";
import assert from "node:assert/strict";
import {
  CAMPOS_CORREGIBLES,
  CORRECTION_MAX_DETAIL,
  CORRECTION_MIN_DETAIL,
  buildCorrectionRequest,
  isCampoCorregible,
  labelCampo,
} from "../src/lib/correction-request.mjs";

const DETALLE = "Mi teléfono cambió: ahora es 0414-1234567.";

test("los campos corregibles tienen valor y etiqueta", () => {
  assert.ok(CAMPOS_CORREGIBLES.length >= 5);

  for (const campo of CAMPOS_CORREGIBLES) {
    assert.ok(campo.valor, "cada campo necesita valor");
    assert.ok(campo.etiqueta, `"${campo.valor}" necesita etiqueta legible`);
    assert.equal(campo.valor, campo.valor.toLowerCase());
  }

  // Hay una salida para lo que no esta en la lista.
  assert.ok(isCampoCorregible("otro"));
});

test("isCampoCorregible acepta solo los campos de la lista", () => {
  assert.equal(isCampoCorregible("telefono"), true);
  assert.equal(isCampoCorregible("TELEFONO"), true);
  assert.equal(isCampoCorregible(" telefono "), true);
  assert.equal(isCampoCorregible("passwordHash"), false);
  assert.equal(isCampoCorregible("cedula"), false);
  assert.equal(isCampoCorregible(""), false);
  assert.equal(isCampoCorregible(null), false);
  assert.equal(isCampoCorregible(undefined), false);
  assert.equal(isCampoCorregible({}), false);
});

test("labelCampo traduce y no inventa", () => {
  assert.equal(labelCampo("email"), "Correo electrónico");
  assert.equal(labelCampo("desconocido"), "desconocido");
  assert.equal(labelCampo(null), "");
});

test("buildCorrectionRequest exige un campo valido", () => {
  for (const campo of ["", null, undefined, "password", "cedula", "saldo"]) {
    const resultado = buildCorrectionRequest({ campo, detalle: DETALLE });

    assert.equal(resultado.ok, false);
    assert.match(resultado.message, /qué dato/i);
  }
});

test("buildCorrectionRequest exige un detalle util", () => {
  for (const detalle of ["", "  ", null, undefined, "no", "cambiar"]) {
    const resultado = buildCorrectionRequest({ campo: "telefono", detalle });

    assert.equal(resultado.ok, false);
    assert.match(resultado.message, /mínimo/i);
  }

  assert.equal(
    buildCorrectionRequest({ campo: "telefono", detalle: "x".repeat(CORRECTION_MIN_DETAIL - 1) }).ok,
    false,
  );
  assert.equal(
    buildCorrectionRequest({ campo: "telefono", detalle: "x".repeat(CORRECTION_MIN_DETAIL) }).ok,
    true,
  );
});

test("buildCorrectionRequest normaliza y devuelve el campo con su etiqueta", () => {
  const resultado = buildCorrectionRequest({ campo: " TELEFONO ", detalle: `  ${DETALLE}  ` });

  assert.equal(resultado.ok, true);
  assert.equal(resultado.campo, "telefono");
  assert.equal(resultado.etiqueta, "Teléfono");
  assert.equal(resultado.detalle, DETALLE);
});

test("buildCorrectionRequest colapsa espacios y recorta el detalle", () => {
  const conSaltos = buildCorrectionRequest({
    campo: "direccion",
    detalle: "Mi   dirección\n\ncambió    de calle",
  });

  assert.equal(conSaltos.detalle, "Mi dirección cambió de calle");

  const larguisimo = buildCorrectionRequest({
    campo: "direccion",
    detalle: "a".repeat(CORRECTION_MAX_DETAIL + 500),
  });

  assert.equal(larguisimo.ok, true);
  assert.equal(larguisimo.detalle.length, CORRECTION_MAX_DETAIL);
});

test("buildCorrectionRequest no se rompe sin argumentos", () => {
  const resultado = buildCorrectionRequest();

  assert.equal(resultado.ok, false);
  assert.ok(resultado.message);
});
