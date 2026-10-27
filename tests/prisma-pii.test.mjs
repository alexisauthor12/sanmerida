import test from "node:test";
import assert from "node:assert/strict";
import { cifrarArgumentos, memberPiiExtension } from "../src/lib/prisma-pii.mjs";
import { isEncryptedField } from "../src/lib/field-crypto.mjs";

const ENV = { AUTH_SECRET: "secreto-de-prueba-para-la-extension-de-prisma" };

// La extension lee el entorno del proceso, que es lo que hace la aplicacion.
process.env.AUTH_SECRET = ENV.AUTH_SECRET;

test("cifra `data` (create y update)", async () => {
  const args = await cifrarArgumentos({ data: { direccion: "Calle 23" } });

  assert.ok(isEncryptedField(args.data.direccion));
});

test("cifra `create` y `update` de un upsert, los dos", async () => {
  const args = await cifrarArgumentos({
    where: { cedula: "V-1" },
    create: { direccion: "Calle 23", cedula: "V-1" },
    update: { references: "Pedro, 0414-1111111" },
  });

  assert.ok(isEncryptedField(args.create.direccion));
  assert.ok(isEncryptedField(args.update.references));
  // La cedula NO se cifra: sigue en claro a proposito (esta en las rutas del bucket).
  assert.equal(args.create.cedula, "V-1");
  // Y el `where` no se toca.
  assert.deepEqual(args.where, { cedula: "V-1" });
});

test("cifra un array de `data` (createMany)", async () => {
  const args = await cifrarArgumentos({
    data: [{ direccion: "Uno" }, { direccion: "Dos" }],
  });

  assert.equal(args.data.length, 2);
  assert.ok(isEncryptedField(args.data[0].direccion));
  assert.ok(isEncryptedField(args.data[1].direccion));
  assert.notEqual(args.data[0].direccion, args.data[1].direccion);
});

test("no toca los argumentos que no son de escritura", async () => {
  const original = { where: { cedula: "V-1" }, select: { direccion: true } };
  const args = await cifrarArgumentos(original);

  assert.deepEqual(args, original);
});

test("aguanta argumentos vacios o raros sin reventar", async () => {
  for (const entrada of [undefined, null, {}, { data: null }, { data: 42 }, { data: "texto" }]) {
    const args = await cifrarArgumentos(entrada);

    assert.ok(args === entrada || typeof args === "object");
  }
});

test("la extension se declara sobre memberProfile", () => {
  assert.equal(memberPiiExtension.name, "member-pii");
  assert.ok(memberPiiExtension.query.memberProfile.$allOperations);
});
