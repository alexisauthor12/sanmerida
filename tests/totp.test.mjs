import test from "node:test";
import assert from "node:assert/strict";
import {
  TOTP_DIGITOS,
  base32Decode,
  base32Encode,
  buildOtpAuthUri,
  findRecoveryCodeIndex,
  formatTotpSecret,
  generateRecoveryCodes,
  generateTotpCode,
  generateTotpSecret,
  hashRecoveryCode,
  igualdadConstante,
  normalizeRecoveryCode,
  normalizeTotpCode,
  verifyTotpCode,
} from "../src/lib/totp.mjs";

/** Secreto de los vectores de prueba del RFC 6238 ("12345678901234567890"). */
const SECRETO_RFC = base32Encode(new TextEncoder().encode("12345678901234567890"));

test("base32Encode coincide con los vectores del RFC 4648", () => {
  assert.equal(base32Encode(new TextEncoder().encode("")), "");
  assert.equal(base32Encode(new TextEncoder().encode("f")), "MY");
  assert.equal(base32Encode(new TextEncoder().encode("fo")), "MZXQ");
  assert.equal(base32Encode(new TextEncoder().encode("foo")), "MZXW6");
  assert.equal(base32Encode(new TextEncoder().encode("foob")), "MZXW6YQ");
  assert.equal(base32Encode(new TextEncoder().encode("fooba")), "MZXW6YTB");
  assert.equal(base32Encode(new TextEncoder().encode("foobar")), "MZXW6YTBOI");
});

test("base32Decode deshace base32Encode", () => {
  const original = new Uint8Array([0, 1, 2, 250, 255, 128, 64, 32, 16, 8]);
  const decodificado = base32Decode(base32Encode(original));

  assert.deepEqual(Array.from(decodificado), Array.from(original));
});

test("base32Decode tolera como teclea el usuario (minusculas, espacios, guiones)", () => {
  const esperado = base32Encode(new TextEncoder().encode("12345678901234567890"));
  const conRuido = esperado.toLowerCase().replace(/(.{4})/g, "$1 ");
  const conGuion = `${"JBSWY3DPEHPK3PXP".slice(0, 4)}-${"JBSWY3DPEHPK3PXP".slice(4)}`;

  assert.deepEqual(Array.from(base32Decode(conRuido)), Array.from(base32Decode(esperado)));
  assert.deepEqual(Array.from(base32Decode(conGuion)), Array.from(base32Decode("JBSWY3DPEHPK3PXP")));
  assert.equal(base32Decode("").length, 0);
  assert.equal(base32Decode(null).length, 0);
  assert.equal(base32Decode("!!!").length, 0);
});

test("generateTotpSecret produce 160 bits en base32", () => {
  const secreto = generateTotpSecret();

  assert.equal(secreto.length, 32);
  assert.match(secreto, /^[A-Z2-7]{32}$/);
  assert.notEqual(generateTotpSecret(), generateTotpSecret());
});

test("generateTotpCode coincide con los vectores del RFC 6238 (SHA-1, 8 digitos)", async () => {
  const vectores = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];

  for (const [segundos, esperado] of vectores) {
    const codigo = await generateTotpCode(SECRETO_RFC, { timestamp: segundos * 1000, digitos: 8 });

    assert.equal(codigo, esperado, `T=${segundos}`);
  }
});

test("generateTotpCode coincide con los vectores del RFC 6238 en 6 digitos", async () => {
  assert.equal(await generateTotpCode(SECRETO_RFC, { timestamp: 59000 }), "287082");
  assert.equal(await generateTotpCode(SECRETO_RFC, { timestamp: 1111111109000 }), "081804");
  assert.equal(await generateTotpCode(SECRETO_RFC, { timestamp: 1234567890000 }), "005924");
});

test("generateTotpCode mantiene el codigo durante todo el periodo de 30 segundos", async () => {
  // Se alinea al inicio del periodo: si no, 29 s despues ya se cae en el siguiente.
  const inicio = 1700000000000 - (1700000000000 % 30000);
  const alPrincipio = await generateTotpCode(SECRETO_RFC, { timestamp: inicio });
  const casiAlFinal = await generateTotpCode(SECRETO_RFC, { timestamp: inicio + 29000 });

  assert.equal(alPrincipio, casiAlFinal);
});

test("generateTotpCode falla con un secreto invalido", async () => {
  await assert.rejects(() => generateTotpCode("", { timestamp: 0 }), /no es valido/);
});

test("verifyTotpCode acepta el codigo actual", async () => {
  const momento = 1700000000000;
  const codigo = await generateTotpCode(SECRETO_RFC, { timestamp: momento });

  assert.equal(await verifyTotpCode(SECRETO_RFC, codigo, { timestamp: momento }), true);
  // Tambien si el usuario lo escribe con el formato "123 456".
  assert.equal(
    await verifyTotpCode(SECRETO_RFC, `${codigo.slice(0, 3)} ${codigo.slice(3)}`, { timestamp: momento }),
    true,
  );
});

test("verifyTotpCode tolera un periodo de deriva a cada lado", async () => {
  const momento = 1700000000000;
  const codigo = await generateTotpCode(SECRETO_RFC, { timestamp: momento });

  // 30 s antes y 30 s despues siguen valiendo (ventana = 1).
  assert.equal(await verifyTotpCode(SECRETO_RFC, codigo, { timestamp: momento - 30000 }), true);
  assert.equal(await verifyTotpCode(SECRETO_RFC, codigo, { timestamp: momento + 30000 }), true);

  // A partir de ahi, no.
  assert.equal(await verifyTotpCode(SECRETO_RFC, codigo, { timestamp: momento + 90000 }), false);
  assert.equal(await verifyTotpCode(SECRETO_RFC, codigo, { timestamp: momento - 90000 }), false);
});

test("verifyTotpCode rechaza entradas con forma invalida", async () => {
  const momento = 1700000000000;

  for (const entrada of ["", null, undefined, "12345", "1234567", "abcdef", "  "]) {
    assert.equal(
      await verifyTotpCode(SECRETO_RFC, entrada, { timestamp: momento }),
      false,
      `"${entrada}" no deberia pasar`,
    );
  }

  assert.equal(await verifyTotpCode("", "123456", { timestamp: momento }), false);
});

test("verifyTotpCode rechaza un codigo bien formado pero incorrecto", async () => {
  const momento = 1700000000000;
  // Se descartan los codigos validos de las tres ventanas, para que la prueba no
  // dependa de la suerte.
  const validos = new Set(
    await Promise.all(
      [-30000, 0, 30000].map((delta) => generateTotpCode(SECRETO_RFC, { timestamp: momento + delta })),
    ),
  );

  let falso = "000000";

  for (let intento = 0; intento < 1000 && validos.has(falso); intento += 1) {
    falso = String(intento).padStart(6, "0");
  }

  assert.ok(!validos.has(falso));
  assert.equal(await verifyTotpCode(SECRETO_RFC, falso, { timestamp: momento }), false);
});

test("verifyTotpCode no acepta el codigo de otro secreto", async () => {
  const momento = 1700000000000;
  const codigo = await generateTotpCode(generateTotpSecret(), { timestamp: momento });

  assert.equal(await verifyTotpCode(SECRETO_RFC, codigo, { timestamp: momento }), false);
});

test("normalizeTotpCode deja solo 6 digitos", () => {
  assert.equal(normalizeTotpCode("123456"), "123456");
  assert.equal(normalizeTotpCode("123 456"), "123456");
  assert.equal(normalizeTotpCode("123-456"), "123456");
  assert.equal(normalizeTotpCode(" 123456 "), "123456");
  assert.equal(normalizeTotpCode("12345"), "");
  assert.equal(normalizeTotpCode("1234567"), "");
  assert.equal(normalizeTotpCode("abcdef"), "");
  assert.equal(normalizeTotpCode(null), "");
});

test("igualdadConstante compara sin cortocircuitar", () => {
  assert.equal(igualdadConstante("123456", "123456"), true);
  assert.equal(igualdadConstante("123456", "123457"), false);
  assert.equal(igualdadConstante("123456", "12345"), false);
  assert.equal(igualdadConstante("", ""), true);
  assert.equal(igualdadConstante(null, undefined), true);
});

test("buildOtpAuthUri construye un URI valido para la app autenticadora", () => {
  const uri = buildOtpAuthUri({ secret: "JBSWY3DPEHPK3PXP", accountName: "admin@sanmerida.com" });
  const url = new URL(uri);

  assert.ok(uri.startsWith("otpauth://totp/"));
  assert.equal(url.searchParams.get("issuer"), "SAN Merida");
  assert.equal(url.searchParams.get("secret"), "JBSWY3DPEHPK3PXP");
  assert.equal(url.searchParams.get("digits"), "6");
  assert.equal(url.searchParams.get("period"), "30");
  assert.equal(url.searchParams.get("algorithm"), "SHA1");
  // El emisor no debe ir con "+" (lo que haria URLSearchParams): algunas apps lo
  // leen literal y mostrarian "SAN+Merida".
  assert.ok(!uri.includes("SAN+Merida"));
  assert.ok(uri.includes("SAN%20Merida"));
});

test("buildOtpAuthUri acepta un emisor propio", () => {
  const uri = buildOtpAuthUri({ secret: "JBSWY3DPEHPK3PXP", accountName: "ana", issuer: "Otro" });

  assert.equal(new URL(uri).searchParams.get("issuer"), "Otro");
  assert.ok(uri.includes("Otro%3Aana"));
});

test("formatTotpSecret agrupa en bloques de 4", () => {
  assert.equal(formatTotpSecret("JBSWY3DPEHPK3PXP"), "JBSW Y3DP EHPK 3PXP");
  assert.equal(formatTotpSecret(""), "");
});

test("generateRecoveryCodes emite codigos unicos y legibles", () => {
  const codigos = generateRecoveryCodes();

  assert.equal(codigos.length, 8);
  assert.equal(new Set(codigos).size, 8);

  for (const codigo of codigos) {
    assert.equal(codigo.length, 10);
    // Sin I, L ni O: son los que se confunden al leerlos en voz alta o al teclear.
    assert.match(codigo, /^[A-HJ-KM-NP-Z2-7]{10}$/);
  }

  assert.equal(generateRecoveryCodes(3).length, 3);
  assert.equal(generateRecoveryCodes(0).length, 0);
  assert.equal(generateRecoveryCodes(-5).length, 0);
});

test("hashRecoveryCode es estable y no reversible a simple vista", async () => {
  const hash = await hashRecoveryCode("ABCD234567");

  assert.equal(hash.length, 64);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(await hashRecoveryCode("ABCD234567"), hash);
  assert.notEqual(await hashRecoveryCode("ABCD234568"), hash);
  // Tolerante al formato en que lo teclee el usuario.
  assert.equal(await hashRecoveryCode("abcd-2345-67"), hash);
  assert.equal(await hashRecoveryCode(""), "");
  assert.equal(await hashRecoveryCode(null), "");
});

test("findRecoveryCodeIndex encuentra el codigo y descarta los demas", async () => {
  const codigos = generateRecoveryCodes(4);
  const hashes = await Promise.all(codigos.map((codigo) => hashRecoveryCode(codigo)));

  for (const [indice, codigo] of codigos.entries()) {
    assert.equal(await findRecoveryCodeIndex(codigo, hashes), indice);
  }

  assert.equal(await findRecoveryCodeIndex("ZZZZZZZZZZ", hashes), -1);
  assert.equal(await findRecoveryCodeIndex("", hashes), -1);
  assert.equal(await findRecoveryCodeIndex(codigos[0], null), -1);
  assert.equal(await findRecoveryCodeIndex(codigos[0], []), -1);
});

test("normalizeRecoveryCode limpia el formato de presentacion", () => {
  assert.equal(normalizeRecoveryCode("ABCD2-34567"), "ABCD234567");
  assert.equal(normalizeRecoveryCode("abcd234567"), "ABCD234567");
  assert.equal(normalizeRecoveryCode("ABCD 2345 67"), "ABCD234567");
  // 0, 1, 8, 9 y O/I/L no pertenecen al alfabeto.
  assert.equal(normalizeRecoveryCode("AB0D1L89"), "ABD");
});

test("un codigo de recuperacion nunca vale como codigo TOTP", async () => {
  // Cuidado con el supuesto facil: los codigos de recuperacion usan el alfabeto
  // base32 (A-Z y 2-7), asi que **si llevan digitos**. `normalizeTotpCode` extrae
  // los digitos y solo devuelve algo si son exactamente 6, cosa que ocurre en ~0,4 %
  // de los codigos. Afirmar que siempre devuelve "" es un test inestable (falla ~8 %
  // de las veces con 20 codigos), y ademas no es la propiedad que importa.
  //
  // La propiedad que importa es esta: un codigo de recuperacion se comprueba contra
  // su propio hash, nunca contra el secreto TOTP, asi que no puede validar como TOTP.
  const secreto = generateTotpSecret();
  const codigos = generateRecoveryCodes(20);

  for (const codigo of codigos) {
    assert.equal(
      await verifyTotpCode(secreto, codigo),
      false,
      `el codigo de recuperacion ${codigo} valido como TOTP`,
    );
  }
});

test("normalizeTotpCode solo devuelve vacio o exactamente 6 digitos", () => {
  for (const codigo of generateRecoveryCodes(20)) {
    const normalizado = normalizeTotpCode(codigo);

    assert.ok(
      normalizado === "" || /^\d{6}$/.test(normalizado),
      `normalizeTotpCode devolvio algo raro: ${JSON.stringify(normalizado)}`,
    );
  }
});

test("TOTP_DIGITOS es 6, el valor que asumen las apps", () => {
  assert.equal(TOTP_DIGITOS, 6);
});
