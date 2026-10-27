import test from "node:test";
import assert from "node:assert/strict";
import {
  MIN_SECRET_LENGTH,
  isStrongSecret,
  resolveAuthSecret,
} from "../src/lib/secret-helpers.mjs";

test("resolveAuthSecret es fail-closed: sin secreto lanza siempre", () => {
  for (const value of [undefined, null, "", "   "]) {
    assert.throws(() => resolveAuthSecret(value), /AUTH_SECRET no esta configurado/);
  }
});

test("resolveAuthSecret no cae nunca a un secreto por defecto", () => {
  // El bug original: fuera de produccion se firmaba con "san-local-dev-auth-secret",
  // un valor publico que permitia forjar tokens de administrador.
  let resultado = null;

  try {
    resultado = resolveAuthSecret(undefined);
  } catch {
    resultado = "lanzo";
  }

  assert.equal(resultado, "lanzo");
});

test("resolveAuthSecret recorta el valor y avisa si es corto", () => {
  const avisos = [];
  const largo = "a".repeat(MIN_SECRET_LENGTH);

  assert.equal(resolveAuthSecret(`  ${largo}  `, { warn: (m) => avisos.push(m) }), largo);
  assert.equal(avisos.length, 0);

  const cortos = [];

  assert.equal(resolveAuthSecret("corto", { warn: (m) => cortos.push(m) }), "corto");
  assert.equal(cortos.length, 1);
  assert.match(cortos[0], /AUTH_SECRET es corto/);
});

test("resolveAuthSecret tolera que no se pase receptor de avisos", () => {
  assert.equal(resolveAuthSecret("corto"), "corto");
});

test("isStrongSecret aplica la longitud minima", () => {
  assert.equal(isStrongSecret("a".repeat(MIN_SECRET_LENGTH)), true);
  assert.equal(isStrongSecret("a".repeat(MIN_SECRET_LENGTH - 1)), false);
  assert.equal(isStrongSecret(""), false);
  assert.equal(isStrongSecret(null), false);
});
