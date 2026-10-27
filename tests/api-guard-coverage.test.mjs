import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Cobertura de autorizacion (docs/SEGURIDAD_INTEGRAL.md 11.2).
 *
 * Recorre TODAS las rutas de `src/app/api/**` y exige que cada una pase por el
 * guard (`requirePermission` / `requireSession` / `requireExpedienteAccess`) o
 * figure en una lista blanca explicita.
 *
 * Es el mecanismo que impide que el hueco de `/api/member-files/*` se repita: una
 * ruta nueva sin guard rompe esta prueba y bloquea el despliegue.
 */

const RAIZ = process.cwd();
const API_DIR = path.resolve(RAIZ, "src", "app", "api");
const GUARD = path.resolve(RAIZ, "src", "lib", "api-guard.ts");

/** Rutas publicas por diseno (deben coincidir con PUBLIC_ROUTES del guard). */
const PUBLICAS = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/register",
  "/api/dev/create-member-admin",
];

/**
 * Deuda tecnica reconocida: rutas que aun comprueban la sesion por su cuenta y
 * todavia NO pasan por el guard. **Esta lista solo puede encoger**: si una ruta
 * de aqui ya usa el guard, la prueba falla y obliga a quitarla.
 */
const PENDIENTES = [
  "/api/auth/admin-license",
  "/api/auth/session-status",
  "/api/financing-motos",
  "/api/monitor-cuotas",
  "/api/noticias",
];

function rutasRouteTs(dir) {
  const encontradas = [];

  for (const entrada of readdirSync(dir)) {
    const ruta = path.join(dir, entrada);

    if (statSync(ruta).isDirectory()) {
      encontradas.push(...rutasRouteTs(ruta));
      continue;
    }

    if (entrada === "route.ts") encontradas.push(ruta);
  }

  return encontradas;
}

function rutaDeArchivo(archivo) {
  const relativa = path.relative(API_DIR, path.dirname(archivo)).split(path.sep).join("/");

  return `/api/${relativa}`;
}

function usaGuard(contenido) {
  return (
    contenido.includes("requirePermission(") ||
    contenido.includes("requireSession(") ||
    contenido.includes("requireExpedienteAccess(")
  );
}

const RUTAS = rutasRouteTs(API_DIR);

test("la prueba encuentra las rutas del proyecto", () => {
  assert.ok(RUTAS.length >= 8, `Se encontraron ${RUTAS.length} rutas; se esperaban al menos 8.`);
});

test("ninguna ruta queda sin guard fuera de la lista blanca y de la deuda", () => {
  const sinGuard = [];

  for (const archivo of RUTAS) {
    const ruta = rutaDeArchivo(archivo);

    if (PUBLICAS.includes(ruta) || PENDIENTES.includes(ruta)) continue;

    if (!usaGuard(readFileSync(archivo, "utf8"))) sinGuard.push(ruta);
  }

  assert.deepEqual(
    sinGuard,
    [],
    `Estas rutas no pasan por el guard de autorizacion: ${sinGuard.join(", ")}`,
  );
});

test("la deuda tecnica solo encoge: nada de PENDIENTES puede tener ya el guard", () => {
  const yaMigradas = [];

  for (const archivo of RUTAS) {
    const ruta = rutaDeArchivo(archivo);

    if (!PENDIENTES.includes(ruta)) continue;

    if (usaGuard(readFileSync(archivo, "utf8"))) yaMigradas.push(ruta);
  }

  assert.deepEqual(
    yaMigradas,
    [],
    `Estas rutas ya usan el guard: quitalas de PENDIENTES -> ${yaMigradas.join(", ")}`,
  );
});

test("la deuda tecnica no puede crecer (lista cerrada y con tope)", () => {
  assert.ok(
    PENDIENTES.length <= 5,
    `PENDIENTES tiene ${PENDIENTES.length} entradas: la deuda no debe crecer.`,
  );
});

test("ninguna ruta migrada usa getSessionUser suelto", () => {
  const adHoc = [];

  for (const archivo of RUTAS) {
    const ruta = rutaDeArchivo(archivo);

    if (PUBLICAS.includes(ruta) || PENDIENTES.includes(ruta)) continue;

    if (readFileSync(archivo, "utf8").includes("getSessionUser(")) adHoc.push(ruta);
  }

  assert.deepEqual(
    adHoc,
    [],
    `Estas rutas comprueban la sesion por su cuenta en vez de usar el guard: ${adHoc.join(", ")}`,
  );
});

test("toda ruta con guard lo importa del modulo correcto", () => {
  const malImportadas = [];

  for (const archivo of RUTAS) {
    const contenido = readFileSync(archivo, "utf8");

    if (!usaGuard(contenido)) continue;

    if (!contenido.includes('from "@/lib/api-guard"')) malImportadas.push(rutaDeArchivo(archivo));
  }

  assert.deepEqual(
    malImportadas,
    [],
    `Rutas que usan el guard sin importarlo: ${malImportadas.join(", ")}`,
  );
});

test("PUBLIC_ROUTES del guard declara todas las rutas publicas", () => {
  const guard = readFileSync(GUARD, "utf8");

  for (const ruta of PUBLICAS) {
    assert.ok(guard.includes(`"${ruta}"`), `PUBLIC_ROUTES no declara ${ruta}`);
  }
});
