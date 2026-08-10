import test from "node:test";
import assert from "node:assert/strict";
import { isBcryptHash, normalizeMemberUsername } from "../src/lib/security-helpers.mjs";

test("normalizeMemberUsername normaliza espacios, case y arroba", () => {
  assert.equal(normalizeMemberUsername(" Alexis"), "@alexis");
  assert.equal(normalizeMemberUsername("@ALEXIS"), "@alexis");
  assert.equal(normalizeMemberUsername(""), "");
});

test("isBcryptHash valida prefijos bcrypt permitidos", () => {
  assert.equal(isBcryptHash("$2b$12$abcdefghijklmnopqrstuvabcdefghijklmnopqrstuvabcd"), true);
  assert.equal(isBcryptHash("$2a$10$abcdefghijklmnopqrstuvabcdefghijklmnopqrstuvabcd"), true);
  assert.equal(isBcryptHash("$2y$08$abcdefghijklmnopqrstuvabcdefghijklmnopqrstuvabcd"), true);
  assert.equal(isBcryptHash("$1$bad-format"), false);
  assert.equal(isBcryptHash(""), false);
});
