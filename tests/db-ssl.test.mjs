import test from "node:test";
import assert from "node:assert/strict";
import {
  CA_ENV,
  BUNDLED_CA_PATH,
  CERTIFICATE_HINT,
  EXTRA_CA_ENV,
  NO_VERIFY_ENV,
  NOTE_NO_CA,
  buildDbSsl,
  dbSslFor,
  isCertificateError,
  isLocalDatabase,
  isSupabaseDatabase,
  resolveDbSslMode,
  sslWarning,
} from "../src/lib/db-ssl.mjs";

const REMOTA = "postgresql://postgres.x:secreta@aws-1-us-east-1.pooler.supabase.com:6543/postgres";
const LOCAL = "postgresql://postgres:localdev@127.0.0.1:5432/sanmerida";
/** Otro proveedor: su certificado es publico y valida con la CA del sistema. */
const OTRO_PROVEEDOR = "postgresql://usuario:secreta@ep-cool-1234.us-east-2.aws.neon.tech:5432/neondb";

test("reconoce el Postgres local", () => {
  assert.equal(isLocalDatabase(LOCAL), true);
  assert.equal(isLocalDatabase("postgresql://postgres:localdev@localhost:5432/sanmerida"), true);
  assert.equal(isLocalDatabase(REMOTA), false);
  assert.equal(isLocalDatabase(undefined), false);
});

test("sin configuracion se VALIDA, no se desactiva la validacion", () => {
  const { ssl, aviso, modo } = buildDbSsl(OTRO_PROVEEDOR, {});

  assert.equal(modo, "validar");
  assert.deepEqual(ssl, { rejectUnauthorized: true });
  assert.equal(aviso, null);
});

test("contra Supabase usa la CA incluida en el repositorio, sin configurar nada", () => {
  const { ssl, aviso, modo } = buildDbSsl(REMOTA, {});

  assert.equal(modo, "proyecto");
  assert.equal(ssl.rejectUnauthorized, true);
  assert.match(ssl.ca, /BEGIN CERTIFICATE/);
  assert.equal(aviso, null);
});

test("la CA incluida es un certificado real", async () => {
  const { readFileSync } = await import("node:fs");

  const pem = readFileSync(BUNDLED_CA_PATH, "utf8");

  assert.match(pem, /^-----BEGIN CERTIFICATE-----/);
  assert.match(pem, /-----END CERTIFICATE-----\s*$/);
  assert.ok(pem.length > 800, "un certificado raiz no puede ser tan corto");
});

test("reconoce Supabase y no confunde a otros proveedores", () => {
  assert.equal(isSupabaseDatabase(REMOTA), true);
  assert.equal(isSupabaseDatabase("postgresql://x@db.abcdefg.supabase.co:5432/postgres"), true);
  assert.equal(isSupabaseDatabase(OTRO_PROVEEDOR), false);
  assert.equal(isSupabaseDatabase(LOCAL), false);
  assert.equal(isSupabaseDatabase(undefined), false);
});

test("la CA del repositorio NO se aplica a otros proveedores", () => {
  // Neon, RDS, etc. usan CAs publicas: forzar la de Supabase los romperia.
  assert.equal(resolveDbSslMode(OTRO_PROVEEDOR, {}).modo, "validar");
});

test("DATABASE_CA_CERT tiene prioridad sobre la CA incluida", () => {
  assert.equal(resolveDbSslMode(REMOTA, { [CA_ENV]: "otra.crt" }).modo, "ca");
});

test("el Postgres local no usa TLS", () => {
  const { ssl, aviso } = buildDbSsl(LOCAL, {});

  assert.equal(ssl, undefined);
  assert.equal(aviso, null);
});

test("con la CA del proyecto valida contra ella", () => {
  const leidos = [];
  const { ssl, aviso, modo } = buildDbSsl(
    REMOTA,
    { [CA_ENV]: "certs/raiz.crt" },
    (ruta) => {
      leidos.push(ruta);
      return "-----BEGIN CERTIFICATE-----\nraiz\n-----END CERTIFICATE-----\n";
    },
  );

  assert.equal(modo, "ca");
  assert.deepEqual(leidos, ["certs/raiz.crt"]);
  assert.equal(ssl.rejectUnauthorized, true);
  assert.match(ssl.ca, /BEGIN CERTIFICATE/);
  assert.equal(aviso, null);
});

test("NODE_EXTRA_CA_CERTS lo resuelve Node, no hay que pasarlo al driver", () => {
  const { ssl, modo } = buildDbSsl(REMOTA, { [EXTRA_CA_ENV]: "C:\\certs\\raiz.crt" });

  assert.equal(modo, "extra-ca");
  assert.deepEqual(ssl, { rejectUnauthorized: true });
});

test("desactivar la validacion exige un acto deliberado y AVISA", () => {
  const { ssl, aviso, modo } = buildDbSsl(REMOTA, { [NO_VERIFY_ENV]: "1" });

  assert.equal(modo, "sin-verificar");
  assert.deepEqual(ssl, { rejectUnauthorized: false });
  assert.ok(aviso, "debe haber aviso");
  assert.match(aviso, /DESACTIVADA/);
  assert.match(aviso, /mitad|leer el tráfico/);
  assert.match(aviso, new RegExp(CA_ENV));
});

test("desactivar manda sobre la CA (permite el escape cuando no hay CA)", () => {
  const { modo } = resolveDbSslMode(REMOTA, { [NO_VERIFY_ENV]: "1", [CA_ENV]: "x.crt" });

  assert.equal(modo, "sin-verificar");
});

test("desactivar no afecta al Postgres local", () => {
  const { ssl, aviso } = buildDbSsl(LOCAL, { [NO_VERIFY_ENV]: "1" });

  assert.equal(ssl, undefined);
  assert.equal(aviso, null);
});

test("solo los valores afirmativos desactivan la validacion", () => {
  for (const valor of ["1", "true", "TRUE", "si", "sí", "yes", " 1 "]) {
    assert.equal(resolveDbSslMode(REMOTA, { [NO_VERIFY_ENV]: valor }).modo, "sin-verificar", valor);
  }

  // Un "0" o una cadena vacia NO desactivan: hay que ser explicito.
  for (const valor of ["0", "false", "", "no", "  ", undefined]) {
    assert.equal(
      resolveDbSslMode(OTRO_PROVEEDOR, { [NO_VERIFY_ENV]: valor }).modo,
      "validar",
      String(valor),
    );
  }
});

test("sslWarning solo avisa en el modo sin verificar", () => {
  assert.equal(sslWarning("validar"), null);
  assert.equal(sslWarning("local"), null);
  assert.equal(sslWarning("ca"), null);
  assert.equal(sslWarning("proyecto"), null);
  assert.equal(sslWarning("extra-ca"), null);
  assert.ok(sslWarning("sin-verificar"));
});

test("la pista de certificado explica el motivo real y las dos salidas", () => {
  assert.match(CERTIFICATE_HINT, /autofirmado/);
  assert.match(CERTIFICATE_HINT, new RegExp(CA_ENV));
  assert.match(CERTIFICATE_HINT, new RegExp(NO_VERIFY_ENV));
});

test("isCertificateError distingue los errores de TLS de los demas", () => {
  assert.equal(isCertificateError({ code: "SELF_SIGNED_CERT_IN_CHAIN" }), true);
  assert.equal(isCertificateError(new Error("self-signed certificate in certificate chain")), true);
  assert.equal(isCertificateError({ code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" }), true);
  assert.equal(isCertificateError(new Error("password authentication failed")), false);
  assert.equal(isCertificateError({ code: "ECONNREFUSED" }), false);
  assert.equal(isCertificateError(undefined), false);
});

test("la nota de 'sin CA' es una linea accionable", () => {
  assert.match(NOTE_NO_CA, new RegExp(CA_ENV));
  assert.match(NOTE_NO_CA, /OPERACIONES_PRODUCCION/);
  assert.ok(NOTE_NO_CA.length < 400, "no puede ser un muro de texto");
});

test("dbSslFor devuelve solo la opcion ssl y no revienta", () => {
  const ssl = dbSslFor(REMOTA, {});

  assert.equal(ssl.rejectUnauthorized, true);
  assert.match(ssl.ca, /BEGIN CERTIFICATE/);
  assert.equal(dbSslFor(LOCAL, {}), undefined);
});

test("dbSslFor usa process.env por defecto", () => {
  // Sin DATABASE_SSL_NO_VERIFY en el entorno real, valida con la CA incluida.
  const ssl = dbSslFor(REMOTA);

  assert.equal(ssl.rejectUnauthorized, true);
  assert.ok(ssl.ca, "debe llevar la CA incluida");
});

test("no hay ningun script con la validacion desactivada a mano", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");

  const carpeta = join(process.cwd(), "scripts");
  const culpables = [];

  for (const archivo of readdirSync(carpeta)) {
    if (!archivo.endsWith(".mjs")) continue;

    const contenido = readFileSync(join(carpeta, archivo), "utf8");

    // `rejectUnauthorized: false` escrito a mano en un script = hallazgo F abierto.
    if (/rejectUnauthorized:\s*false/.test(contenido)) culpables.push(archivo);
  }

  assert.deepEqual(culpables, [], `estos scripts desactivan la validacion TLS: ${culpables.join(", ")}`);
});
