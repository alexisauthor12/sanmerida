import test from "node:test";
import assert from "node:assert/strict";
import { encryptMemberKey } from "../src/lib/member-credentials.mjs";
import {
  MEMBER_KEY_LEGACY_ENV,
  MEMBER_KEY_SECRET_ENV,
  decryptMemberKeyWithEnv,
  encryptMemberKeyWithEnv,
  resolveMemberKeySecrets,
} from "../src/lib/member-key-secret.mjs";

const HEREDADO = "secreto-heredado-de-firma-de-sesiones";
const NUEVO = "secreto-nuevo-solo-para-credenciales";
const CLAVE = "SAN-MEMBER-7KQ4M2";

test("sin secreto propio se sigue usando AUTH_SECRET (nada se rompe)", () => {
  const resuelto = resolveMemberKeySecrets({ [MEMBER_KEY_LEGACY_ENV]: HEREDADO });

  assert.equal(resuelto.activo, HEREDADO);
  assert.equal(resuelto.heredado, "");
  assert.equal(resuelto.separado, false);
});

test("con secreto propio, el activo es el nuevo y el heredado queda de respaldo", () => {
  const resuelto = resolveMemberKeySecrets({
    [MEMBER_KEY_SECRET_ENV]: NUEVO,
    [MEMBER_KEY_LEGACY_ENV]: HEREDADO,
  });

  assert.equal(resuelto.activo, NUEVO);
  assert.equal(resuelto.heredado, HEREDADO);
  assert.equal(resuelto.separado, true);
});

test("resolveMemberKeySecrets tolera espacios y comillas del entorno", () => {
  const resuelto = resolveMemberKeySecrets({
    [MEMBER_KEY_SECRET_ENV]: `  "${NUEVO}"  `,
    [MEMBER_KEY_LEGACY_ENV]: ` '${HEREDADO}' `,
  });

  assert.equal(resuelto.activo, NUEVO);
  assert.equal(resuelto.heredado, HEREDADO);
});

test("resolveMemberKeySecrets no inventa secretos", () => {
  const resuelto = resolveMemberKeySecrets({});

  assert.equal(resuelto.activo, "");
  assert.equal(resuelto.heredado, "");
  assert.equal(resuelto.separado, false);
});

test("cifrar y descifrar con el secreto propio hace ida y vuelta", async () => {
  const env = { [MEMBER_KEY_SECRET_ENV]: NUEVO, [MEMBER_KEY_LEGACY_ENV]: HEREDADO };
  const cifrado = await encryptMemberKeyWithEnv(CLAVE, env);

  assert.ok(cifrado);
  assert.equal(await decryptMemberKeyWithEnv(cifrado, env), CLAVE);
});

test("se cifra con el secreto NUEVO cuando existe", async () => {
  const env = { [MEMBER_KEY_SECRET_ENV]: NUEVO, [MEMBER_KEY_LEGACY_ENV]: HEREDADO };
  const cifrado = await encryptMemberKeyWithEnv(CLAVE, env);

  // Abre con el nuevo y NO con el heredado: la separacion es real.
  assert.equal(await encryptMemberKeyWithEnv(CLAVE, env).then((c) => c !== null), true);
  assert.equal(await decryptMemberKeyWithEnv(cifrado, { [MEMBER_KEY_SECRET_ENV]: NUEVO }), CLAVE);
  assert.equal(await decryptMemberKeyWithEnv(cifrado, { [MEMBER_KEY_LEGACY_ENV]: HEREDADO }), null);
});

test("las credenciales antiguas siguen abriendo durante la transicion", async () => {
  // Simula una fila cifrada ANTES de separar los secretos.
  const antiguo = await encryptMemberKey(CLAVE, HEREDADO);

  assert.ok(antiguo);
  // Con el secreto nuevo ya definido, el respaldo heredado la abre.
  assert.equal(
    await decryptMemberKeyWithEnv(antiguo, {
      [MEMBER_KEY_SECRET_ENV]: NUEVO,
      [MEMBER_KEY_LEGACY_ENV]: HEREDADO,
    }),
    CLAVE,
  );
});

test("una fila antigua no abre si ya no queda el secreto heredado", async () => {
  const antiguo = await encryptMemberKey(CLAVE, HEREDADO);

  assert.equal(await decryptMemberKeyWithEnv(antiguo, { [MEMBER_KEY_SECRET_ENV]: NUEVO }), null);
});

test("decryptMemberKeyWithEnv devuelve null con entradas invalidas", async () => {
  const env = { [MEMBER_KEY_SECRET_ENV]: NUEVO, [MEMBER_KEY_LEGACY_ENV]: HEREDADO };

  assert.equal(await decryptMemberKeyWithEnv("", env), null);
  assert.equal(await decryptMemberKeyWithEnv(null, env), null);
  assert.equal(await decryptMemberKeyWithEnv("v1:a:b", env), null);
  assert.equal(await decryptMemberKeyWithEnv("sin-formato", env), null);
});

test("sin ningun secreto configurado no se cifra nada", async () => {
  assert.equal(await encryptMemberKeyWithEnv(CLAVE, {}), null);
  assert.equal(await decryptMemberKeyWithEnv("v1:a:b", {}), null);
});

test("un secreto propio distinto no abre lo cifrado con el heredado ni al reves", async () => {
  const conNuevo = await encryptMemberKeyWithEnv(CLAVE, { [MEMBER_KEY_SECRET_ENV]: NUEVO });
  const conHeredado = await encryptMemberKeyWithEnv(CLAVE, { [MEMBER_KEY_LEGACY_ENV]: HEREDADO });

  assert.equal(await decryptMemberKeyWithEnv(conNuevo, { [MEMBER_KEY_LEGACY_ENV]: HEREDADO }), null);
  assert.equal(await decryptMemberKeyWithEnv(conHeredado, { [MEMBER_KEY_SECRET_ENV]: NUEVO }), null);
});
