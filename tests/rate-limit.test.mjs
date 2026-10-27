import test from "node:test";
import assert from "node:assert/strict";
import {
  RATE_LIMIT_NAMES,
  RATE_LIMIT_RULES,
  combinarResultados,
  evaluarVentana,
  reglasDe,
} from "../src/lib/rate-limit-rules.mjs";

test("la tabla de reglas tiene los endpoints esperados", () => {
  for (const nombre of ["login", "license", "register", "documentRead", "monitor"]) {
    assert.ok(RATE_LIMIT_NAMES.includes(nombre), `falta la regla ${nombre}`);
  }

  for (const [nombre, regla] of Object.entries(RATE_LIMIT_RULES)) {
    assert.ok(regla.ip || regla.identity, `${nombre} no define ningun limite`);
  }
});

test("login y licencia limitan por IP y por identidad, con tope bajo", () => {
  assert.ok(RATE_LIMIT_RULES.login.ip.limit <= 10);
  assert.ok(RATE_LIMIT_RULES.login.identity.limit <= 5);
  assert.ok(RATE_LIMIT_RULES.license.ip.limit <= 5);
  assert.ok(RATE_LIMIT_RULES.license.identity.limit <= 3);
});

test("reglasDe genera las claves de IP y de identidad", () => {
  const claves = reglasDe("login", { ip: "190.1.2.3", identity: "Admin@SanMerida.com" });

  assert.equal(claves.length, 2);
  assert.deepEqual(claves.map((c) => c.key), [
    "rl:login:ip:190.1.2.3",
    "rl:login:id:admin@sanmerida.com",
  ]);
  assert.equal(claves[0].limit, RATE_LIMIT_RULES.login.ip.limit);
});

test("reglasDe usa marcadores cuando falta IP o identidad", () => {
  const claves = reglasDe("login", {});

  assert.deepEqual(claves.map((c) => c.key), ["rl:login:ip:sin-ip", "rl:login:id:anonimo"]);
});

test("reglasDe no genera identidad si el endpoint no la limita", () => {
  const claves = reglasDe("register", { ip: "10.0.0.1", identity: "alguien" });

  assert.equal(claves.length, 1);
  assert.equal(claves[0].key, "rl:register:ip:10.0.0.1");
});

test("reglasDe devuelve vacio para un endpoint desconocido", () => {
  assert.deepEqual(reglasDe("inventado", { ip: "1.2.3.4" }), []);
});

test("evaluarVentana permite hasta el limite y bloquea al superarlo", () => {
  assert.deepEqual(evaluarVentana({ usados: 0, limite: 3, ventanaSegundos: 900 }), {
    allowed: true,
    remaining: 3,
    retryAfterSeconds: 0,
  });

  assert.deepEqual(evaluarVentana({ usados: 2, limite: 3, ventanaSegundos: 900 }), {
    allowed: true,
    remaining: 1,
    retryAfterSeconds: 0,
  });

  assert.deepEqual(evaluarVentana({ usados: 3, limite: 3, ventanaSegundos: 900 }), {
    allowed: false,
    remaining: 0,
    retryAfterSeconds: 900,
  });
});

test("evaluarVentana es fail-closed con datos invalidos", () => {
  assert.equal(evaluarVentana({ usados: Number.NaN, limite: 5, ventanaSegundos: 60 }).allowed, false);
  assert.equal(evaluarVentana({ usados: 0, limite: 0, ventanaSegundos: 60 }).allowed, false);
  assert.equal(evaluarVentana({ usados: 0, limite: -1, ventanaSegundos: 60 }).allowed, false);
  assert.equal(evaluarVentana({ usados: "x", limite: 5, ventanaSegundos: 60 }).allowed, false);
});

test("combinarResultados deja pasar cuando todas las reglas permiten", () => {
  const resultado = combinarResultados([
    { allowed: true, remaining: 8, retryAfterSeconds: 0, key: "a" },
    { allowed: true, remaining: 3, retryAfterSeconds: 0, key: "b" },
  ]);

  assert.equal(resultado.allowed, true);
  assert.equal(resultado.remaining, 3);
  assert.equal(resultado.bloqueadoPor, null);
});

test("combinarResultados bloquea si alguna regla lo hace y reporta cual", () => {
  const resultado = combinarResultados([
    { allowed: true, remaining: 8, retryAfterSeconds: 0, key: "ip" },
    { allowed: false, remaining: 0, retryAfterSeconds: 900, key: "identidad" },
  ]);

  assert.equal(resultado.allowed, false);
  assert.equal(resultado.bloqueadoPor, "identidad");
  assert.equal(resultado.retryAfterSeconds, 900);
});

test("combinarResultados permite cuando no hay reglas", () => {
  const resultado = combinarResultados([]);

  assert.equal(resultado.allowed, true);
  assert.equal(resultado.bloqueadoPor, null);
});
