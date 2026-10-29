import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * La landing no puede esconder la navegacion en el telefono sin dejar algo en su lugar.
 *
 * Nace de un fallo real: la cabecera de `page.tsx` tenia la navegacion y el bloque de
 * cuenta con `hidden ... md:flex`. Por debajo de `md` desaparecian los dos, y **no habia
 * nada en su lugar**: desde el telefono solo se veia el logo. Ni entrar, ni registrarse,
 * ni llegar a ninguna seccion. Nadie lo noto porque en el escritorio se ve perfecto.
 *
 * Es un fallo que no rompe nada: la pagina carga, no hay error, no hay test rojo. Solo
 * deja al visitante de telefono sin salida. Por eso hace falta una prueba que lo mire.
 */

const PAGINA = readFileSync(join(process.cwd(), "src", "app", "page.tsx"), "utf8");

test("la cabecera de la landing tiene menu para movil", () => {
  assert.match(
    PAGINA,
    /md:hidden/,
    "page.tsx no tiene ningun bloque `md:hidden`: si la cabecera se esconde en movil, " +
      "tiene que haber un menu que la sustituya",
  );
});

test("lo que se esconde en movil tiene su alternativa", () => {
  // `hidden ... md:flex` es la forma en que esta cabecera dice "esto es solo escritorio".
  const soloEscritorio = /className="[^"]*\bhidden\b[^"]*\bmd:flex\b[^"]*"/g;
  const escondidos = PAGINA.match(soloEscritorio) ?? [];

  assert.ok(
    escondidos.length > 0,
    "no se encontro ningun bloque solo-escritorio; la prueba dejo de ser util",
  );

  // Si hay bloques solo-escritorio, tiene que haber contrapartida para movil.
  assert.match(
    PAGINA,
    /md:hidden/,
    `hay ${escondidos.length} bloque(s) que se esconden en movil y ninguno que los sustituya`,
  );
});

test("el menu de movil da acceso a entrar y a registrarse", () => {
  // Es exactamente lo que faltaba: el boton de entrar y el de "Ingresa al TEAM SAN".
  assert.match(PAGINA, /href="\/login"/, "el menu de movil no lleva a /login");
  assert.match(PAGINA, /href="\/member-login"/, "el menu de movil no lleva a /member-login");
  assert.match(PAGINA, /href="\/register"/, "el menu de movil no lleva a /register");
});

test("el boton del menu de movil es accesible", () => {
  // Un icono sin etiqueta es invisible para un lector de pantalla.
  assert.match(PAGINA, /aria-label=\{[^}]*"Abrir menú"/, "el boton del menu no tiene aria-label");
  assert.match(PAGINA, /aria-expanded=\{mobileMenuOpen\}/, "el boton no anuncia si esta abierto");
  assert.match(PAGINA, /aria-controls="menu-movil"/, "el boton no apunta al panel que abre");
});

test("el menu de movil se cierra al tocar fuera y en tactil", () => {
  // En el telefono `mousedown` puede no llegar: sin `touchstart`, el menu se queda
  // abierto tapando la pagina.
  assert.match(PAGINA, /addEventListener\("touchstart"/, "no se escucha touchstart");
  assert.match(PAGINA, /setMobileMenuOpen\(false\)/, "nada cierra el menu de movil");
});
