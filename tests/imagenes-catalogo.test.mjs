import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Las imágenes del catálogo tienen que existir de verdad.
 *
 * Nace de una limpieza real (28/10/2026): el catálogo tenía el mismo archivo dos veces,
 * una con espacios y otra con guiones, y cada pantalla usaba una convención distinta.
 * Al borrar "la que sobraba" es facil borrar la equivocada y dejar una imagen rota que
 * no salta hasta que alguien entra a esa pantalla.
 *
 * Aquí se comprueba lo importante: que toda ruta de imagen declarada en el código
 * apunte a un archivo que existe, y que las rutas con espacios no vuelvan (se codifican
 * como %20 y se rompen con facilidad).
 */

const RAIZ = process.cwd();
const MOTOS = readFileSync(join(RAIZ, "src", "data", "motos.ts"), "utf8");

/** Rutas `imagen: "/archivo.png"` del catálogo. */
function imagenesDelCatalogo() {
  return [...MOTOS.matchAll(/imagen:\s*"([^"]+)"/g)].map((m) => m[1]);
}

test("el catálogo declara imágenes", () => {
  const imagenes = imagenesDelCatalogo();

  assert.ok(imagenes.length >= 10, `solo se encontraron ${imagenes.length} imágenes`);
});

test("todas las imágenes del catálogo existen en public/", () => {
  const faltan = [];

  for (const ruta of imagenesDelCatalogo()) {
    // Las rutas pueden venir con %20 (espacio codificado).
    const archivo = join(RAIZ, "public", decodeURIComponent(ruta.replace(/^\//, "")));

    if (!existsSync(archivo)) faltan.push(ruta);
  }

  assert.deepEqual(faltan, [], `Estas imágenes del catálogo no existen en public/:\n  ${faltan.join("\n  ")}`);
});

test("no hay imágenes con espacios en el nombre", () => {
  // Dos convenciones para el mismo archivo es como se acaba con duplicados. Y una ruta
  // con espacios depende de que cada sitio la codifique igual.
  const conEspacios = imagenesDelCatalogo().filter((r) => r.includes(" ") || r.includes("%20"));

  assert.deepEqual(
    conEspacios,
    [],
    `Estas rutas llevan espacios; renómbralas a guiones:\n  ${conEspacios.join("\n  ")}`,
  );
});

test("ninguna imagen de public/ es un duplicado exacto de otra", () => {
  // Se compara el tamaño: dos archivos del mismo peso son sospechosos y se revisan a
  // mano. No se borra nada automaticamente: la prueba solo avisa.
  const carpeta = join(RAIZ, "public");
  const porPeso = new Map();
  const sospechosos = [];

  for (const nombre of readdirSync(carpeta)) {
    if (!/\.(png|jpe?g|webp)$/i.test(nombre)) continue;

    const peso = statSync(join(carpeta, nombre)).size;
    const clave = `${peso}`;

    if (porPeso.has(clave)) {
      sospechosos.push(`${porPeso.get(clave)} y ${nombre} (${Math.round(peso / 1024)} KB)`);
    } else {
      porPeso.set(clave, nombre);
    }
  }

  assert.deepEqual(sospechosos, [], `Posibles imágenes duplicadas:\n  ${sospechosos.join("\n  ")}`);
});