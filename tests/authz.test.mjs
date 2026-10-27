import test from "node:test";
import assert from "node:assert/strict";
import {
  PERMISSIONS,
  ROLES,
  STEP_UP_PERMISSIONS,
  can,
  isPermission,
  isRole,
  normalizeRole,
  permissionsOf,
  requiresStepUp,
} from "../src/lib/authz.mjs";

/**
 * Matriz esperada: transcripcion literal de la seccion 4.2 de
 * `docs/SEGURIDAD_INTEGRAL.md`. Si alguien cambia la matriz del codigo sin
 * actualizar el documento (o al reves), esta prueba falla.
 */
const ESPERADO = {
  "expediente:read:own": { PROSPECT: false, MEMBER: true, ADMIN: true },
  "expediente:read:any": { PROSPECT: false, MEMBER: false, ADMIN: true },
  "expediente:create": { PROSPECT: false, MEMBER: false, ADMIN: true },
  "expediente:update": { PROSPECT: false, MEMBER: false, ADMIN: true },
  "expediente:delete": { PROSPECT: false, MEMBER: false, ADMIN: true },
  "documento:read:own": { PROSPECT: false, MEMBER: true, ADMIN: true },
  "documento:read:any": { PROSPECT: false, MEMBER: false, ADMIN: true },
  "documento:upload": { PROSPECT: false, MEMBER: false, ADMIN: true },
  "documento:scan": { PROSPECT: false, MEMBER: false, ADMIN: true },
  "documento:delete": { PROSPECT: false, MEMBER: false, ADMIN: true },
  "cuota:read:own": { PROSPECT: false, MEMBER: true, ADMIN: true },
  "cuota:read:any": { PROSPECT: false, MEMBER: false, ADMIN: true },
  "cuota:payment:register": { PROSPECT: false, MEMBER: false, ADMIN: true },
  "cuota:payment:revert": { PROSPECT: false, MEMBER: false, ADMIN: true },
  "credencial:read": { PROSPECT: false, MEMBER: false, ADMIN: true },
  "credencial:rotate": { PROSPECT: false, MEMBER: false, ADMIN: true },
  "financiamiento:read": { PROSPECT: true, MEMBER: true, ADMIN: true },
  "financiamiento:write": { PROSPECT: false, MEMBER: false, ADMIN: true },
  "novedad:read:published": { PROSPECT: true, MEMBER: true, ADMIN: true },
  "novedad:read:any": { PROSPECT: false, MEMBER: false, ADMIN: true },
  "novedad:write": { PROSPECT: false, MEMBER: false, ADMIN: true },
  "grupo:read": { PROSPECT: false, MEMBER: false, ADMIN: true },
  "grupo:export": { PROSPECT: false, MEMBER: false, ADMIN: true },
  "auditoria:read": { PROSPECT: false, MEMBER: false, ADMIN: true },
  "usuario:manage": { PROSPECT: false, MEMBER: false, ADMIN: true },
};

test("no existe el rol OPERATOR y los roles son los tres esperados", () => {
  assert.deepEqual([...ROLES], ["PROSPECT", "MEMBER", "ADMIN"]);
  assert.equal(isRole("OPERATOR"), false);
});

test("la matriz esperada cubre exactamente el catalogo de permisos", () => {
  assert.deepEqual(Object.keys(ESPERADO).sort(), [...PERMISSIONS].sort());
});

test("can() respeta la matriz rol x permiso", () => {
  for (const [permiso, porRol] of Object.entries(ESPERADO)) {
    for (const rol of ROLES) {
      assert.equal(can(rol, permiso), porRol[rol], `${rol} / ${permiso}`);
    }
  }
});

test("ADMIN tiene el catalogo completo y los demas no", () => {
  assert.equal(permissionsOf("ADMIN").length, PERMISSIONS.length);
  assert.ok(permissionsOf("MEMBER").length < PERMISSIONS.length);
  assert.ok(permissionsOf("PROSPECT").length < permissionsOf("MEMBER").length);
});

test("PROSPECT solo tiene permisos publicos (el registro no da poder)", () => {
  assert.deepEqual(permissionsOf("PROSPECT").sort(), [
    "financiamiento:read",
    "novedad:read:published",
  ]);

  for (const permiso of permissionsOf("PROSPECT")) {
    for (const prefijo of ["expediente", "documento", "cuota", "credencial", "grupo", "auditoria", "usuario"]) {
      assert.equal(permiso.startsWith(`${prefijo}:`), false, permiso);
    }
  }
});

test("MEMBER no tiene permisos :any ni de escritura", () => {
  for (const permiso of permissionsOf("MEMBER")) {
    assert.equal(permiso.endsWith(":any"), false, permiso);
  }

  assert.equal(can("MEMBER", "documento:upload"), false);
  assert.equal(can("MEMBER", "expediente:update"), false);
  assert.equal(can("MEMBER", "novedad:write"), false);
  assert.equal(can("MEMBER", "cuota:payment:register"), false);
});

test("fail-closed con roles invalidos o vacios", () => {
  for (const rol of [null, undefined, "", "   ", "OPERATOR", "SUPERADMIN", 123, {}]) {
    assert.equal(can(rol, "financiamiento:read"), false);
    assert.equal(permissionsOf(rol).length, 0);
    assert.equal(isRole(rol), false);
  }
});

test("normalizeRole acepta variantes de escritura y rechaza lo demas", () => {
  assert.equal(normalizeRole(" admin "), "ADMIN");
  assert.equal(normalizeRole("member"), "MEMBER");
  assert.equal(normalizeRole("PROSPECT"), "PROSPECT");
  assert.equal(normalizeRole("operador"), null);
});

test("STEP_UP_PERMISSIONS esta en el catalogo y solo lo tiene ADMIN", () => {
  for (const permiso of STEP_UP_PERMISSIONS) {
    assert.equal(isPermission(permiso), true, permiso);
    assert.equal(requiresStepUp(permiso), true);
    assert.equal(can("PROSPECT", permiso), false, permiso);
    assert.equal(can("MEMBER", permiso), false, permiso);
    assert.equal(can("ADMIN", permiso), true, permiso);
  }

  assert.equal(requiresStepUp("financiamiento:read"), false);
  assert.equal(requiresStepUp("documento:upload"), false);
});

test("isPermission distingue permisos reales de inventados", () => {
  assert.equal(isPermission("documento:read:any"), true);
  assert.equal(isPermission("documento:borrar:todo"), false);
  assert.equal(isPermission(""), false);
  assert.equal(isPermission(null), false);
});

test("can() ignora permisos que no existen en el catalogo", () => {
  assert.equal(can("ADMIN", "documento:borrar:todo"), false);
  assert.equal(can("ADMIN", ""), false);
});
