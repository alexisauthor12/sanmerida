import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_CSP_FIELD,
  MAX_CSP_REPORTS_PER_REQUEST,
  normalizeCspReport,
  parseCspReports,
} from "../src/lib/csp-report.mjs";

const CLASICO = {
  "document-uri": "https://sanmerida.com/login",
  "violated-directive": "script-src 'self' 'unsafe-inline'",
  "effective-directive": "script-src",
  "blocked-uri": "inline",
  "source-file": "https://sanmerida.com/_next/static/chunks/main.js",
  "line-number": 12,
  "column-number": 34,
  disposition: "report",
};

test("normaliza el formato clasico (csp-report)", () => {
  const informe = normalizeCspReport(CLASICO);

  assert.equal(informe.directive, "script-src");
  assert.equal(informe.blockedUri, "inline");
  assert.equal(informe.documentUri, "https://sanmerida.com/login");
  assert.equal(informe.sourceFile, "https://sanmerida.com/_next/static/chunks/main.js");
  assert.equal(informe.lineNumber, 12);
  assert.equal(informe.columnNumber, 34);
  assert.equal(informe.disposition, "report");
});

test("normaliza el formato de la Reporting API (camelCase)", () => {
  const informe = normalizeCspReport({
    effectiveDirective: "style-src",
    blockedURL: "inline",
    documentURL: "https://sanmerida.com/dashboard",
    sourceFile: "https://sanmerida.com/app.css",
    lineNumber: "7",
    columnNumber: "3",
  });

  assert.equal(informe.directive, "style-src");
  assert.equal(informe.blockedUri, "inline");
  assert.equal(informe.documentUri, "https://sanmerida.com/dashboard");
  assert.equal(informe.lineNumber, 7);
  assert.equal(informe.columnNumber, 3);
  // Sin `disposition` explicita se asume informe.
  assert.equal(informe.disposition, "report");
});

test("solo se conservan los campos de la lista cerrada", () => {
  const informe = normalizeCspReport({
    ...CLASICO,
    // Un atacante puede meter lo que quiera: nada de esto debe sobrevivir.
    "script-sample": "<script>alert(1)</script>",
    extra: "valor",
    __proto__: { envenenado: true },
  });

  assert.deepEqual(Object.keys(informe).sort(), [
    "blockedUri",
    "columnNumber",
    "directive",
    "disposition",
    "documentUri",
    "lineNumber",
    "sourceFile",
  ]);
  assert.equal(informe["script-sample"], undefined);
  assert.equal(informe.extra, undefined);
});

test("se descarta lo que no tiene directiva", () => {
  assert.equal(normalizeCspReport({}), null);
  assert.equal(normalizeCspReport({ "blocked-uri": "inline" }), null);
  assert.equal(normalizeCspReport(null), null);
  assert.equal(normalizeCspReport(undefined), null);
  assert.equal(normalizeCspReport("texto"), null);
  assert.equal(normalizeCspReport(42), null);
  assert.equal(normalizeCspReport([]), null);
});

test("los campos se recortan a un tope", () => {
  const informe = normalizeCspReport({
    "effective-directive": "script-src",
    "blocked-uri": "x".repeat(MAX_CSP_FIELD + 500),
  });

  assert.equal(informe.blockedUri.length, MAX_CSP_FIELD);
});

test("una linea o columna invalida queda en null", () => {
  const informe = normalizeCspReport({
    "effective-directive": "img-src",
    "line-number": "no-es-un-numero",
    "column-number": "",
  });

  assert.equal(informe.lineNumber, null);
  assert.equal(informe.columnNumber, null);
});

test("parseCspReports acepta el envoltorio clasico", () => {
  const informes = parseCspReports({ "csp-report": CLASICO });

  assert.equal(informes.length, 1);
  assert.equal(informes[0].directive, "script-src");
});

test("parseCspReports acepta un informe plano", () => {
  const informes = parseCspReports(CLASICO);

  assert.equal(informes.length, 1);
  assert.equal(informes[0].blockedUri, "inline");
});

test("parseCspReports acepta la Reporting API y descarta otros tipos", () => {
  const informes = parseCspReports([
    { type: "csp-violation", body: CLASICO },
    { type: "deprecation", body: { id: "algo" } },
    { type: "csp-violation", body: { "effective-directive": "img-src", "blocked-uri": "https://x.test/a.png" } },
    { body: { "effective-directive": "font-src" } },
  ]);

  assert.equal(informes.length, 3);
  assert.deepEqual(
    informes.map((informe) => informe.directive),
    ["script-src", "img-src", "font-src"],
  );
});

test("parseCspReports acota el numero de informes por peticion", () => {
  const muchos = Array.from({ length: MAX_CSP_REPORTS_PER_REQUEST + 25 }, () => ({
    type: "csp-violation",
    body: CLASICO,
  }));

  assert.equal(parseCspReports(muchos).length, MAX_CSP_REPORTS_PER_REQUEST);
});

test("parseCspReports nunca revienta con entradas raras", () => {
  for (const entrada of [null, undefined, 0, "", "texto", [], {}, [null], [{}], { "csp-report": null }]) {
    const informes = parseCspReports(entrada);

    assert.ok(Array.isArray(informes));
    assert.equal(informes.length, 0);
  }
});
