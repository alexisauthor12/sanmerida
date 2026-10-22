import test from "node:test";
import assert from "node:assert/strict";
import {
  MEMBER_KEY_PATTERN,
  decryptMemberKey,
  encryptMemberKey,
  generateMemberKey,
  isMemberKey,
  maskMemberKey,
} from "../src/lib/member-credentials.mjs";

const SECRET = "secreto-de-pruebas-sanmerida-2026";

test("generateMemberKey produce claves SAN-MEMBER-XXXXXX", () => {
  const first = generateMemberKey();
  const second = generateMemberKey();

  assert.match(first, MEMBER_KEY_PATTERN);
  assert.match(second, MEMBER_KEY_PATTERN);
  assert.notEqual(first, second);
  assert.equal(isMemberKey(first), true);
});

test("isMemberKey rechaza formatos invalidos", () => {
  assert.equal(isMemberKey("san-member-abc123"), true);
  assert.equal(isMemberKey("SAN-MEMBER-ABC12"), false);
  assert.equal(isMemberKey("SAN-MEMBER-ABC1234"), false);
  assert.equal(isMemberKey("SAN-ADMIN-MERIDA-2026"), false);
  assert.equal(isMemberKey(""), false);
});

test("encryptMemberKey y decryptMemberKey hacen ida y vuelta", async () => {
  const plain = "SAN-MEMBER-7KQ4M2";
  const cipher = await encryptMemberKey(plain, SECRET);

  assert.ok(cipher);
  assert.match(cipher, /^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
  assert.ok(!cipher.includes(plain));
  assert.equal(await decryptMemberKey(cipher, SECRET), plain);
});

test("encryptMemberKey cifra distinto cada vez (IV aleatorio)", async () => {
  const plain = "SAN-MEMBER-7KQ4M2";
  const first = await encryptMemberKey(plain, SECRET);
  const second = await encryptMemberKey(plain, SECRET);

  assert.notEqual(first, second);
  assert.equal(await decryptMemberKey(first, SECRET), plain);
  assert.equal(await decryptMemberKey(second, SECRET), plain);
});

test("decryptMemberKey falla con secreto distinto", async () => {
  const cipher = await encryptMemberKey("SAN-MEMBER-7KQ4M2", SECRET);

  assert.equal(await decryptMemberKey(cipher, "otro-secreto"), null);
});

test("decryptMemberKey rechaza texto alterado o mal formado", async () => {
  const cipher = await encryptMemberKey("SAN-MEMBER-7KQ4M2", SECRET);
  const [, iv, data] = cipher.split(":");
  const tampered = `${iv}${data}`.slice(0, -2) + "AA";

  assert.equal(await decryptMemberKey(`v1:${iv}:${tampered}`, SECRET), null);
  assert.equal(await decryptMemberKey("sin-formato", SECRET), null);
  assert.equal(await decryptMemberKey("v2:a:b", SECRET), null);
  assert.equal(await decryptMemberKey("", SECRET), null);
  assert.equal(await decryptMemberKey(cipher, ""), null);
});

test("encryptMemberKey devuelve null sin clave o sin secreto", async () => {
  assert.equal(await encryptMemberKey("", SECRET), null);
  assert.equal(await encryptMemberKey("SAN-MEMBER-7KQ4M2", ""), null);
});

test("maskMemberKey deja ver solo el final de la clave", () => {
  assert.equal(maskMemberKey("SAN-MEMBER-7KQ4M2"), "SAN-MEMBER-••••M2");
  assert.equal(maskMemberKey(""), "No disponible");
});
