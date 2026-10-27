import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_AUDIT_VALUE,
  esClaveSensible,
  extractClientIp,
  extractUserAgent,
  sanitizeMetadata,
  truncate,
} from "../src/lib/request-info.mjs";

/** Simula el `get` de una cabecera (insensible a mayusculas). */
const cabeceras = (mapa) => (nombre) => mapa[String(nombre).toLowerCase()] ?? null;

test("extractClientIp prioriza CF-Connecting-IP", () => {
  assert.equal(extractClientIp(cabeceras({ "cf-connecting-ip": "190.1.2.3" })), "190.1.2.3");
});

test("extractClientIp cae a X-Forwarded-For y toma la primera entrada", () => {
  assert.equal(
    extractClientIp(cabeceras({ "x-forwarded-for": "10.0.0.1, 10.0.0.2" })),
    "10.0.0.1",
  );
});

test("extractClientIp tolera cabeceras ausentes o receptor invalido", () => {
  assert.equal(extractClientIp(cabeceras({})), "");
  assert.equal(extractClientIp(null), "");
  assert.equal(extractClientIp(undefined), "");
});

test("extractUserAgent recorta valores largos y tolera ausencia", () => {
  assert.equal(extractUserAgent(cabeceras({ "user-agent": "Mozilla/5.0" })), "Mozilla/5.0");
  assert.equal(extractUserAgent(cabeceras({ "user-agent": "A".repeat(500) })).length, 301);
  assert.equal(extractUserAgent(null), "");
});

test("truncate recorta y respeta el limite", () => {
  assert.equal(truncate("abc"), "abc");
  assert.equal(truncate("a".repeat(MAX_AUDIT_VALUE + 10)).length, MAX_AUDIT_VALUE + 1);
  assert.equal(truncate(null), "");
});

test("esClaveSensible detecta claves prohibidas", () => {
  const prohibidas = [
    "password",
    "contrasena",
    "memberKey",
    "memberKeyCipher",
    "token",
    "secret",
    "authorization",
    "cookie",
    "passwordHash",
    "totpSecret",
    "hash",
    "key",
    "clave",
    "userAgentHash",
  ];

  for (const clave of prohibidas) {
    assert.equal(esClaveSensible(clave), true, clave);
  }
});

test("esClaveSensible no marca claves utiles e inocuas", () => {
  for (const clave of ["documentKey", "assetType", "variant", "accion", "intervaloDias"]) {
    assert.equal(esClaveSensible(clave), false, clave);
  }
});

test("sanitizeMetadata descarta claves sensibles y recorta valores", () => {
  const limpio = sanitizeMetadata({
    documentKey: "identidad",
    memberKey: "SAN-MEMBER-ABC123",
    password: "secreto",
    token: "abc",
    userAgentHash: "x",
    cantidad: 3,
    activo: true,
    nota: "a".repeat(400),
    anidado: { a: 1 },
    nulo: null,
  });

  assert.equal(limpio.documentKey, "identidad");
  assert.equal(limpio.cantidad, 3);
  assert.equal(limpio.activo, true);
  assert.equal(limpio.nota.length, MAX_AUDIT_VALUE + 1);
  assert.equal(limpio.anidado, '{"a":1}');
  assert.equal("memberKey" in limpio, false);
  assert.equal("password" in limpio, false);
  assert.equal("token" in limpio, false);
  assert.equal("userAgentHash" in limpio, false);
  assert.equal("nulo" in limpio, false);
});

test("sanitizeMetadata devuelve null si no queda nada util", () => {
  assert.equal(sanitizeMetadata(null), null);
  assert.equal(sanitizeMetadata(undefined), null);
  assert.equal(sanitizeMetadata("texto"), null);
  assert.equal(sanitizeMetadata([]), null);
  assert.equal(sanitizeMetadata({ password: "x" }), null);
});
