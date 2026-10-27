import test from "node:test";
import assert from "node:assert/strict";
import {
  AVISO_TRATAMIENTO_DATOS,
  CONSENT_REQUIRED_MESSAGE,
  CONSENT_VERSION,
  buildConsentRecord,
  isConsentAccepted,
  isConsentUpToDate,
} from "../src/lib/consent.mjs";

test("la version del aviso existe y coincide con la del objeto", () => {
  assert.equal(typeof CONSENT_VERSION, "string");
  assert.ok(CONSENT_VERSION.length >= 4);
  assert.equal(AVISO_TRATAMIENTO_DATOS.version, CONSENT_VERSION);
});

test("el aviso tiene titulo, intro y secciones con contenido", () => {
  assert.ok(AVISO_TRATAMIENTO_DATOS.titulo);
  assert.ok(AVISO_TRATAMIENTO_DATOS.intro);
  assert.ok(Array.isArray(AVISO_TRATAMIENTO_DATOS.secciones));
  assert.ok(AVISO_TRATAMIENTO_DATOS.secciones.length >= 5);

  for (const seccion of AVISO_TRATAMIENTO_DATOS.secciones) {
    assert.ok(seccion.titulo, "cada seccion necesita titulo");
    const contenido = seccion.texto ?? seccion.puntos;
    assert.ok(contenido, `la seccion "${seccion.titulo}" no tiene contenido`);
  }
});

test("el aviso cubre lo que la seccion 10.2 del documento exige", () => {
  const texto = JSON.stringify(AVISO_TRATAMIENTO_DATOS);

  // Quien trata, para que, que datos, cuanto tiempo, derechos y como se protege.
  for (const obligatorio of ["Quién los trata", "Para qué", "Qué datos", "Cuánto tiempo", "Tus derechos", "Cómo lo protegemos"]) {
    assert.ok(texto.includes(obligatorio), `falta la seccion "${obligatorio}"`);
  }

  // No puede prometer menos de lo que el sistema hace.
  assert.match(texto, /corrección/i);
  assert.match(texto, /papelera de 30 días/i);
  assert.match(texto, /auditad/i);
  assert.match(texto, /cifrad/i);
});

test("el texto de consentimiento es explicito", () => {
  assert.ok(AVISO_TRATAMIENTO_DATOS.textoConsentimiento);
  assert.match(AVISO_TRATAMIENTO_DATOS.textoConsentimiento, /autorizo/i);
});

test("isConsentAccepted acepta las formas que envian los formularios", () => {
  for (const valor of [true, 1, "1", "true", "TRUE", "on", "on ", "si", "Sí", "acepto"]) {
    assert.equal(isConsentAccepted(valor), true, `"${valor}" deberia aceptarse`);
  }
});

test("isConsentAccepted es fail-closed con todo lo demas", () => {
  for (const valor of [false, 0, "", "  ", "false", "off", "no", null, undefined, {}, [], "quizas"]) {
    assert.equal(isConsentAccepted(valor), false, `"${valor}" NO deberia aceptarse`);
  }
});

test("buildConsentRecord devuelve null sin consentimiento", () => {
  for (const accepted of [undefined, null, false, "", "no"]) {
    assert.equal(buildConsentRecord({ accepted }), null);
  }

  assert.equal(buildConsentRecord(), null);
});

test("buildConsentRecord guarda la version y la fecha del consentimiento", () => {
  const ahora = new Date("2026-10-26T12:00:00.000Z");
  const registro = buildConsentRecord({ accepted: true, now: ahora });

  assert.deepEqual(registro, {
    consentimientoVersion: CONSENT_VERSION,
    consentimientoAceptadoAt: ahora,
  });
});

test("buildConsentRecord respeta una version explicita", () => {
  const registro = buildConsentRecord({ accepted: "on", version: "2025-01" });

  assert.equal(registro?.consentimientoVersion, "2025-01");
});

test("isConsentUpToDate detecta cuando hay que volver a aceptar", () => {
  assert.equal(isConsentUpToDate({ consentimientoVersion: CONSENT_VERSION }), true);
  assert.equal(isConsentUpToDate({ consentimientoVersion: "2020-01" }), false);
  assert.equal(isConsentUpToDate({}), false);
  assert.equal(isConsentUpToDate(null), false);
  assert.equal(isConsentUpToDate(undefined), false);
  // Version distinta a la vigente, comparada explicitamente.
  assert.equal(isConsentUpToDate({ consentimientoVersion: "2020-01" }, "2020-01"), true);
});

test("el mensaje de error no revela nada tecnico", () => {
  assert.match(CONSENT_REQUIRED_MESSAGE, /aceptar el aviso/i);
  assert.ok(!/prisma|base de datos|error/i.test(CONSENT_REQUIRED_MESSAGE));
});
