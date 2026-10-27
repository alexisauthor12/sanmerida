import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Toda ruta `/api/...` que llame el cliente tiene que existir de verdad.
 *
 * Este test nace de un fallo real: la pantalla de acceso administrativo de la landing
 * seguia llamando a `/api/auth/admin-direct-login`, que se habia **eliminado a proposito**
 * por ser un agujero. El endpoint devolvia 404, `response.json()` fallaba con la pagina
 * HTML del 404 y el usuario veia "Error de conexion" — un mensaje que no tenia nada que
 * ver con la causa y que costo un rato de diagnostico.
 *
 * Eliminar una ruta es parte del trabajo. Acordarse de todos los sitios que la llaman,
 * no. Esto lo comprueba solo.
 */

const RAIZ = process.cwd();
const API_DIR = join(RAIZ, "src", "app", "api");
const SRC_DIR = join(RAIZ, "src");

/** Todos los `route.ts` del proyecto, como rutas relativas a `src/app/api`. */
function rutasApi(dir = API_DIR, prefijo = "") {
  const encontradas = [];

  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);

    if (statSync(ruta).isDirectory()) {
      encontradas.push(...rutasApi(ruta, prefijo ? `${prefijo}/${entrada}` : entrada));
    } else if (entrada === "route.ts" || entrada === "route.tsx") {
      encontradas.push(prefijo);
    }
  }

  return encontradas;
}

/** Archivos de cliente (y de servidor) que pueden llamar a la API. */
function archivosFuente(dir = SRC_DIR) {
  const encontrados = [];

  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);

    if (statSync(ruta).isDirectory()) {
      encontrados.push(...archivosFuente(ruta));
    } else if (/\.(ts|tsx)$/.test(entrada)) {
      encontrados.push(ruta);
    }
  }

  return encontrados;
}

/** Saca las rutas `/api/...` que aparecen como primer argumento de un `fetch(`. */
function rutasLlamadas(contenido) {
  const llamadas = [];
  const patron = /fetch\(\s*([`"'])([^`"']*)\1/g;

  let coincidencia = patron.exec(contenido);

  while (coincidencia) {
    const dentro = coincidencia[2];
    const api = dentro.match(/\/api\/[A-Za-z0-9\-/_[\]]*/);

    if (api) llamadas.push(api[0].replace(/\/+$/, ""));

    coincidencia = patron.exec(contenido);
  }

  return llamadas;
}

const RUTAS = rutasApi();
const ARCHIVOS = archivosFuente();

test("el test encuentra rutas y archivos", () => {
  assert.ok(RUTAS.length >= 8, `Se encontraron ${RUTAS.length} rutas de API.`);
  assert.ok(ARCHIVOS.length >= 20, `Se encontraron ${ARCHIVOS.length} archivos.`);
});

test("ninguna llamada del cliente apunta a una ruta de API inexistente", () => {
  const faltantes = [];

  for (const archivo of ARCHIVOS) {
    const contenido = readFileSync(archivo, "utf8");
    const relativo = archivo.replace(RAIZ, "").replace(/\\/g, "/");

    for (const llamada of rutasLlamadas(contenido)) {
      const buscada = llamada.replace(/^\/api\/?/, "");

      // Coincidencia exacta con un `route.ts`.
      if (RUTAS.includes(buscada)) continue;

      // O con una ruta dinamica cuyo prefijo coincida (por ejemplo, una llamada
      // construida con una variable: `/api/modelos/` + slug).
      const segmentos = buscada.split("/").filter(Boolean);

      const porPrefijo = RUTAS.some((ruta) => {
        const suyos = ruta.split("/").filter(Boolean);

        return segmentos.every((segmento, indice) => suyos[indice] === segmento);
      });

      if (porPrefijo) continue;

      faltantes.push(`${relativo} -> ${llamada}`);
    }
  }

  assert.deepEqual(
    faltantes,
    [],
    `Estas llamadas apuntan a rutas que no existen:\n  ${faltantes.join("\n  ")}`,
  );
});

test("la ruta de acceso directo eliminada no vuelve a aparecer en el cliente", () => {
  // Se elimino por ser un agujero (entraba con usuario + licencia y SIN contrasena).
  // Si alguien la reintroduce en el cliente, es que algo se ha entendido al reves.
  const culpables = [];

  for (const archivo of ARCHIVOS) {
    if (!/\.tsx?$/.test(archivo)) continue;

    const contenido = readFileSync(archivo, "utf8");

    if (rutasLlamadas(contenido).some((llamada) => llamada.includes("admin-direct-login"))) {
      culpables.push(archivo.replace(RAIZ, "").replace(/\\/g, "/"));
    }
  }

  assert.deepEqual(culpables, [], "El acceso directo sin contrasena no debe volver");
});
