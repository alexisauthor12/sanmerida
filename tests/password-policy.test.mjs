import test from "node:test";
import assert from "node:assert/strict";
import {
  MIN_CRITERIA,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  evaluatePassword,
  forbiddenFragments,
  passwordByteLength,
  validatePassword,
} from "../src/lib/password-policy.mjs";

const FUERTE = "Tractor-Verde-47!";
const USUARIO = { nombre: "Alexis", apellido: "Ruiz", email: "alexruizrondon@gmail.com" };

test("los umbrales son los de la seccion 7.5 del documento", () => {
  assert.equal(PASSWORD_MIN_LENGTH, 12);
  assert.equal(MIN_CRITERIA, 3);
  assert.equal(PASSWORD_MAX_BYTES, 72);
});

test("acepta una contrasena que cumple todo", () => {
  assert.deepEqual(validatePassword(FUERTE, USUARIO), { ok: true });
});

test("rechaza por longitud", () => {
  const resultado = validatePassword("Ab1!Corta", USUARIO);

  assert.equal(resultado.ok, false);
  assert.match(resultado.message, /al menos 12 caracteres/);
  assert.deepEqual(resultado.faltantes, ["12 caracteres"]);
});

test("acepta exactamente la longitud minima", () => {
  // 12 caracteres justos, con los 4 tipos.
  assert.equal(validatePassword("Abcdefgh1!xy", USUARIO).ok, true);
  assert.equal(validatePassword("Abcdefgh1!x", USUARIO).ok, false);
});

test("exige 3 de los 4 tipos de caracter", () => {
  // Solo minusculas y digitos: 2 tipos.
  const dosTipos = validatePassword("abcdefghij12", USUARIO);

  assert.equal(dosTipos.ok, false);
  assert.match(dosTipos.message, /al menos 3/);
  assert.ok(dosTipos.faltantes.length >= 1);

  // Minusculas + mayusculas + digitos: 3 tipos, pasa.
  assert.equal(validatePassword("Abcdefghij12", USUARIO).ok, true);
  // Minusculas + mayusculas + simbolo: 3 tipos, pasa.
  assert.equal(validatePassword("Abcdefghij!x", USUARIO).ok, true);
});

test("rechaza las contrasenas comunes", () => {
  for (const comun of ["Password1234", "sanmerida2026", "administrador", "Qwerty123456"]) {
    const resultado = validatePassword(comun, USUARIO);

    assert.equal(resultado.ok, false, `"${comun}" no deberia pasar`);
  }
});

test("rechaza contrasenas que contienen datos del propio usuario", () => {
  for (const derivada of ["Alexis-2026-Motos!", "Ruiz.Merida.2026!", "alexruizrondon-2026!"]) {
    const resultado = validatePassword(derivada, USUARIO);

    assert.equal(resultado.ok, false, `"${derivada}" no deberia pasar`);
    assert.match(resultado.message, /tu nombre|datos personales|negocio/);
  }
});

test("rechaza contrasenas con el nombre del negocio", () => {
  for (const derivada of ["SanMerida-Motos-1!", "Mi-Moto-Sanmerida-1", "Financiamiento-1!"]) {
    assert.equal(validatePassword(derivada, USUARIO).ok, false, `"${derivada}" no deberia pasar`);
  }
});

test("la comprobacion ignora acentos y mayusculas", () => {
  // "MERIDA" y "merida" son el mismo fragmento prohibido.
  assert.equal(validatePassword("MERIDA-Es-Mi-Ciudad-1", USUARIO).ok, false);
  // Y con acentos.
  assert.equal(validatePassword("SanMérida-Total-1!", USUARIO).ok, false);
});

test("sin datos del usuario solo se aplican las reglas generales", () => {
  assert.equal(validatePassword("Alexis-Ruiz-2026!", {}).ok, true);
  assert.equal(validatePassword("Alexis-Ruiz-2026!", USUARIO).ok, false);
});

test("rechaza por encima de 72 bytes (limite real de bcrypt)", () => {
  const larguisima = `Aa1!${"x".repeat(80)}`;
  const resultado = validatePassword(larguisima, USUARIO);

  assert.equal(resultado.ok, false);
  assert.match(resultado.message, /demasiado larga/);
});

test("los acentos y emojis cuentan mas de un byte", () => {
  assert.equal(passwordByteLength("á"), 2);
  assert.equal(passwordByteLength("a"), 1);
  assert.ok(passwordByteLength("😀") >= 4);

  // 30 emojis superan los 72 bytes aunque sean 30 "caracteres".
  assert.equal(validatePassword(`Aa1!${"😀".repeat(30)}`, USUARIO).ok, false);
});

test("evaluatePassword informa sin juzgar (para la interfaz)", () => {
  const evaluacion = evaluatePassword("Abcdefghij12");

  assert.equal(evaluacion.longitud, 12);
  assert.equal(evaluacion.bytes, 12);
  assert.equal(evaluacion.cumplidos, 3);
  assert.deepEqual(
    evaluacion.criterios.map((criterio) => [criterio.id, criterio.cumple]),
    [["minuscula", true], ["mayuscula", true], ["digito", true], ["simbolo", false]],
  );
});

test("evaluatePassword nunca revienta", () => {
  for (const entrada of [null, undefined, "", 0, {}, []]) {
    const evaluacion = evaluatePassword(entrada);

    assert.equal(typeof evaluacion.longitud, "number");
    assert.equal(evaluacion.criterios.length, 4);
  }
});

test("forbiddenFragments saca el nombre, el correo y el negocio", () => {
  const fragmentos = forbiddenFragments(USUARIO);

  assert.ok(fragmentos.includes("alexis"));
  assert.ok(fragmentos.includes("ruiz"));
  assert.ok(fragmentos.includes("alexruizrondon"));
  assert.ok(fragmentos.includes("merida"));
  assert.ok(fragmentos.includes("sanmerida"));
  // Fragmentos de menos de 4 caracteres no aportan nada.
  assert.ok(!fragmentos.includes("de"));
  assert.ok(!fragmentos.includes("a"));
});

test("forbiddenFragments tolera que falten datos", () => {
  const fragmentos = forbiddenFragments();

  assert.ok(Array.isArray(fragmentos));
  assert.ok(fragmentos.includes("sanmerida"));
});
