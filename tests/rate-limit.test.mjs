import test from "node:test";
import assert from "node:assert/strict";
import {
  RATE_LIMIT_NAMES,
  RATE_LIMIT_RULES,
  combinarResultados,
  evaluarVentana,
  reglasDe,
  siguienteConteo,
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

/**
 * Ventana FIJA del contador compartido (Cloudflare KV).
 *
 * Nace de un fallo real: el backend de KV guardaba el contador y dejaba que el
 * `expirationTtl` llevara el final de la ventana. Como cada `put` reinicia ese TTL,
 * la ventana se alargaba con **cada intento**: quien siguiera probando no salia
 * nunca del bloqueo, y un tercero podia mantener bloqueada la cuenta de otra
 * persona martilleandola (la regla por identidad va contra el correo enviado).
 *
 * El contador en memoria siempre se comporto como ventana fija. Estos casos fijan
 * que los dos backends coincidan.
 */
test("siguienteConteo abre la ventana en el primer intento", () => {
  const ahora = 1_700_000_000_000;
  const { conteo, expiraMs, restanteSegundos } = siguienteConteo({
    crudo: null,
    ahoraMs: ahora,
    ventanaSegundos: 900,
  });

  assert.equal(conteo, 1);
  assert.equal(expiraMs, ahora + 900_000);
  assert.equal(restanteSegundos, 900);
});

test("siguienteConteo NO mueve el final de la ventana al seguir intentando", () => {
  const inicio = 1_700_000_000_000;
  const ventanaSegundos = 900;

  // Primer intento: abre la ventana.
  let estado = siguienteConteo({ crudo: null, ahoraMs: inicio, ventanaSegundos });
  const expiraEsperado = estado.expiraMs;

  assert.equal(expiraEsperado, inicio + 900_000);

  // Diez intentos mas, espaciados: el conteo sube y el final NO se mueve. Si se
  // moviera, el bloqueo se alargaria solo por insistir.
  for (let i = 1; i <= 10; i += 1) {
    const ahora = inicio + i * 1000;

    estado = siguienteConteo({
      crudo: `${estado.conteo}|${estado.expiraMs}`,
      ahoraMs: ahora,
      ventanaSegundos,
    });

    assert.equal(estado.conteo, i + 1, `el conteo no subio en el intento ${i}`);
    assert.equal(estado.expiraMs, expiraEsperado, `la ventana se movio en el intento ${i}`);
    assert.ok(
      estado.restanteSegundos <= ventanaSegundos,
      "el TTL no puede superar la ventana",
    );
  }

  assert.equal(estado.conteo, 11);
});

test("siguienteConteo reinicia el conteo cuando la ventana vence", () => {
  const inicio = 1_700_000_000_000;
  const expira = inicio + 900_000;

  // Justo despues del vencimiento: cuenta nueva y ventana nueva.
  const { conteo, expiraMs } = siguienteConteo({
    crudo: `7|${expira}`,
    ahoraMs: expira + 1,
    ventanaSegundos: 900,
  });

  assert.equal(conteo, 1);
  assert.equal(expiraMs, expira + 1 + 900_000);
});

test("siguienteConteo respeta un valor suelto de la version anterior", () => {
  // Antes se guardaba solo el numero. No se tira el conteo: se le da ventana nueva.
  const ahora = 1_700_000_000_000;
  const { conteo, expiraMs } = siguienteConteo({
    crudo: "7",
    ahoraMs: ahora,
    ventanaSegundos: 300,
  });

  assert.equal(conteo, 8);
  assert.equal(expiraMs, ahora + 300_000);
});

test("siguienteConteo aguanta basura sin romperse ni alargar la ventana", () => {
  const ahora = 1_700_000_000_000;

  for (const crudo of ["", "  ", "abc", "-3", "1|", "|2", "NaN", undefined, null]) {
    const { conteo, expiraMs, restanteSegundos } = siguienteConteo({
      crudo,
      ahoraMs: ahora,
      ventanaSegundos: 60,
    });

    assert.ok(Number.isFinite(conteo), `conteo no finito con crudo=${JSON.stringify(crudo)}`);
    assert.ok(conteo >= 1, `conteo por debajo de 1 con crudo=${JSON.stringify(crudo)}`);
    assert.equal(expiraMs, ahora + 60_000);
    assert.equal(restanteSegundos, 60);
  }
});

test("siguienteConteo usa 60 s si la ventana llega invalida", () => {
  const ahora = 1_700_000_000_000;

  for (const ventana of [0, -5, Number.NaN, "x", null]) {
    const { expiraMs, restanteSegundos } = siguienteConteo({
      crudo: null,
      ahoraMs: ahora,
      ventanaSegundos: ventana,
    });

    assert.equal(expiraMs, ahora + 60_000);
    assert.equal(restanteSegundos, 60);
  }
});

test("siguienteConteo mantiene el TTL por encima del minimo de Cloudflare KV", () => {
  // KV exige al menos 60 s. En el ultimo tramo de la ventana quedarian menos.
  const expira = 1_700_000_900_000;
  const { restanteSegundos } = siguienteConteo({
    crudo: `9|${expira}`,
    ahoraMs: expira - 5_000,
    ventanaSegundos: 900,
  });

  assert.equal(restanteSegundos, 60);
});
