/**
 * Renombra las fotos extraidas del catalogo con el nombre de su modelo.
 *
 * Las paginas del PDF ya dicen que modelo es cada foto; lo unico que hay que arreglar es
 * la decodificacion de algunos glifos. Canva incrusta las fuentes en subconjuntos y
 * algunos caracteres del mapa ToUnicode salen mal: la `T` mayuscula llega como `t`, y
 * `SS` como `t`. Se corrige aqui, que es mas seguro que pelearse con el mapa.
 */
import { existsSync, readdirSync, renameSync } from "node:fs";

/** Modelo de cada pagina, ya corregido a mano leyendo el texto extraido. */
const PAGINAS = {
  2: { marca: "Bera", modelo: "Tocialista" },
  3: { marca: "Bera", modelo: "BRF" },
  4: { marca: "Bera", modelo: "BR 200" },
  5: { marca: "Bera", modelo: "Leon" },
  6: { marca: "Bera", modelo: "EBR" },
  7: { marca: "Bera", modelo: "Kavak" },
  8: { marca: "Bera", modelo: "Kavak" },
  9: { marca: "Bera", modelo: "Milan" },
  10: { marca: "Bera", modelo: "Milan" },
  11: { marca: "Bera", modelo: "Runner" },
  12: { marca: "Bera", modelo: "Cobra" },
  13: { marca: "Bera", modelo: "BWT" },
  15: { marca: "EK", modelo: "Xpress Lite" },
  16: { marca: "EK", modelo: "Xpress Rayo" },
  17: { marca: "EK", modelo: "Xpress Paleta" },
  18: { marca: "EK", modelo: "Xpress Paleta II" },
  19: { marca: "EK", modelo: "New Horte" },
  20: { marca: "EK", modelo: "Owen" },
  21: { marca: "EK", modelo: "Owen II" },
  23: { marca: "EK", modelo: "Matriz II" },
  24: { marca: "EK", modelo: "New Outlook II" },
  26: { marca: "MD", modelo: "Aguila" },
  27: { marca: "MD", modelo: "Lechuza" },
  28: { marca: "MD", modelo: "Lechuza II" },
  29: { marca: "MD", modelo: "Cuervo" },
  30: { marca: "MD", modelo: "Canario" },
  31: { marca: "MD", modelo: "Condor" },
  32: { marca: "MD", modelo: "Falco" },
  34: { marca: "AVA", modelo: "Leopardo" },
  35: { marca: "AVA", modelo: "Leopardo II" },
  36: { marca: "AVA", modelo: "Leon" },
  37: { marca: "AVA", modelo: "Mule" },
  38: { marca: "AVA", modelo: "Mustang" },
  39: { marca: "AVA", modelo: "Pantera" },
  40: { marca: "AVA", modelo: "Tigrito" },
  42: { marca: "AVA", modelo: "Avipon" },
  43: { marca: "AVA", modelo: "Tucan" },
  44: { marca: "AVA", modelo: "Flath" },
  46: { marca: "Toro", modelo: "CRX" },
  47: { marca: "Toro", modelo: "Jaguar" },
  48: { marca: "Toro", modelo: "Leon" },
  50: { marca: "Toro", modelo: "Cappuccino" },
  51: { marca: "Toro", modelo: "Foxtr" },
  52: { marca: "Toro", modelo: "Tanktr" },
  53: { marca: "Toro", modelo: "Moka" },
  55: { marca: "ET", modelo: "Cuda Hero" },
  56: { marca: "ET", modelo: "Cuda M200" },
};

/** "Bera Leon" -> "bera-leon" */
const aSlug = (texto) =>
  texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const archivos = readdirSync("catalogo/fotos").filter((n) => n.startsWith("pagina-"));
let renombradas = 0;
const sinNombre = [];

for (const archivo of archivos.sort()) {
  // pagina-26-01.png -> 26
  const pagina = Number(archivo.match(/pagina-(\d+)/)?.[1] ?? 0);
  const datos = PAGINAS[pagina];

  if (!datos) {
    sinNombre.push(archivo);
    continue;
  }

  const sufijo = archivo.match(/pagina-\d+-(\d+)/)?.[1] ?? "01";
  const base = aSlug(`${datos.marca} ${datos.modelo}`);
  const destino = `catalogo/fotos/${base}${sufijo !== "01" ? `-${sufijo}` : ""}.png`;

  if (existsSync(destino)) continue;

  renameSync(`catalogo/fotos/${archivo}`, destino);
  renombradas += 1;
}

console.log(`renombradas: ${renombradas}`);
console.log(`sin nombre de modelo: ${sinNombre.length}`);

for (const a of sinNombre) console.log(`  ${a}`);