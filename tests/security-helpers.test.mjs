import test from "node:test";
import assert from "node:assert/strict";
import { isBcryptHash, normalizeMemberUsername } from "../src/lib/security-helpers.mjs";

test("normalizeMemberUsername normaliza espacios, case y arroba", () => {
  assert.equal(normalizeMemberUsername(" Alexis"), "@alexis");
  assert.equal(normalizeMemberUsername("@ALEXIS"), "@alexis");
  assert.equal(normalizeMemberUsername(""), "");
});

test("isBcryptHash valida prefijos bcrypt permitidos", () => {
  // Un hash bcrypt real tiene 60 caracteres: $2x$CC$ + 53 caracteres de cuerpo (salt + digest).
  assert.equal(isBcryptHash("$2b$12$abcdefghijklmnopqrstuvabcdefghijklmnopqrstuvabcdefghi"), true);
  assert.equal(isBcryptHash("$2a$10$abcdefghijklmnopqrstuvabcdefghijklmnopqrstuvabcdefghi"), true);
  assert.equal(isBcryptHash("$2y$08$abcdefghijklmnopqrstuvabcdefghijklmnopqrstuvabcdefghi"), true);
  assert.equal(isBcryptHash("$2b$12$abcdefghijklmnopqrstuvabcdefghijklmnopqrstuvabcd"), false);
  assert.equal(isBcryptHash("$1$bad-format"), false);
  assert.equal(isBcryptHash(""), false);
});
