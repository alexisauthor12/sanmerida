import test from "node:test";
import assert from "node:assert/strict";
import {
  CATEGORIAS_FEED,
  claseCategoria,
  filtrarPorCategoria,
  resumirFeed,
  tiempoRelativo,
} from "../src/lib/noticias-feed.mjs";

const AHORA = new Date("2026-03-20T12:00:00.000Z");
const HORA = 60 * 60 * 1000;

test("claseCategoria usa la clase de la categoria y un respaldo neutro", () => {
  assert.equal(claseCategoria("Eventos"), "text-sky-400 bg-sky-400/10");
  assert.equal(claseCategoria("  Modelos "), "text-emerald-400 bg-emerald-400/10");
  assert.equal(claseCategoria("Inventada"), "text-white/70 bg-white/10");
  assert.equal(claseCategoria(undefined), "text-white/70 bg-white/10");
});

test("CATEGORIAS_FEED tiene color definido para todas sus categorias", () => {
  for (const categoria of CATEGORIAS_FEED) {
    assert.notEqual(claseCategoria(categoria), "text-white/70 bg-white/10");
  }
});

test("tiempoRelativo describe minutos, horas, ayer y dias", () => {
  const relativo = (ms) => tiempoRelativo(new Date(AHORA.getTime() - ms).toISOString(), { ahora: AHORA });

  assert.equal(relativo(30 * 1000), "Ahora mismo");
  assert.equal(relativo(5 * 60 * 1000), "Hace 5 min");
  assert.equal(relativo(3 * HORA), "Hace 3 h");
  assert.equal(relativo(30 * HORA), "Ayer");
  assert.equal(relativo(5 * 24 * HORA), "Hace 5 días");
});

test("tiempoRelativo usa el respaldo con fechas viejas o invalidas", () => {
  assert.equal(
    tiempoRelativo(new Date(AHORA.getTime() - 60 * 24 * HORA).toISOString(), {
      ahora: AHORA,
      respaldo: "01/01/2025",
    }),
    "01/01/2025",
  );
  assert.equal(tiempoRelativo("no-es-fecha", { respaldo: "—" }), "—");
  assert.equal(tiempoRelativo("no-es-fecha"), "");
});

test("filtrarPorCategoria compara sin distinguir mayusculas ni espacios", () => {
  const posts = [
    { id: "a", categoria: "Eventos" },
    { id: "b", categoria: "eventos " },
    { id: "c", categoria: "Modelos" },
  ];

  assert.deepEqual(
    filtrarPorCategoria(posts, "EVENTOS").map((post) => post.id),
    ["a", "b"],
  );
  assert.deepEqual(
    filtrarPorCategoria(posts, "").map((post) => post.id),
    ["a", "b", "c"],
  );
  assert.deepEqual(filtrarPorCategoria(undefined, "Eventos"), []);
});

test("resumirFeed cuenta publicaciones, categorias, destacadas y la mas reciente", () => {
  const resumen = resumirFeed([
    { categoria: "Eventos", destacado: false, fechaIso: "2026-03-10T10:00:00.000Z" },
    { categoria: "Modelos", destacado: true, fechaIso: "2026-03-18T10:00:00.000Z" },
    { categoria: "Eventos", destacado: true, fechaIso: "2026-03-01T10:00:00.000Z" },
  ]);

  assert.equal(resumen.total, 3);
  assert.equal(resumen.categorias, 2);
  assert.equal(resumen.destacadas, 2);
  assert.equal(resumen.ultimaFecha.toISOString(), "2026-03-18T10:00:00.000Z");
});

test("resumirFeed tolera listas vacias o invalidas", () => {
  const resumen = resumirFeed(null);

  assert.equal(resumen.total, 0);
  assert.equal(resumen.categorias, 0);
  assert.equal(resumen.destacadas, 0);
  assert.equal(resumen.ultimaFecha, null);
});
