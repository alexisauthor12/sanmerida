/**
 * Rehace las fotos del catalogo con el mapeo CORRECTO.
 *
 * El error anterior: se asigno cada foto a la pagina siguiente. De ahi salieron tres
 * fallos que se veian en la web:
 *   - `bera-tocialista` recibio el fondo de portada (3 MB de decoracion, no una moto);
 *   - `bera-br-200` recibio una imagen en blanco (la pagina trae dos: una vacia y la moto);
 *   - `bera-milan` recibio una imagen oscura.
 *
 * La regla correcta: **el texto de la pagina N describe la moto de la pagina N**, y de
 * las imagenes de esa pagina se elige la que de verdad es una moto (brillo y desviacion
 * altos, tamano razonable), descartando fondos y lienzos vacios.
 */
import { mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import sharp from "sharp";

const ORIGEN = "catalogo/fotos";
const DESTINO = "public/catalogo";

mkdirSync(DESTINO, { recursive: true });

/**
 * Modelo de cada pagina, leido del texto que el propio extractor saco de esa pagina.
 * La `t` suelta es una `S` o una `T` mal decodificada por el mapa de fuentes de Canva.
 */
const MODELOS = {
  3: ["bera-socialista", "Bera Socialista"],
  4: ["bera-brf", "Bera BRF"],
  5: ["bera-br-200", "Bera BR 200"],
  6: ["bera-leon", "Bera León"],
  7: ["bera-ebr", "Bera EBR"],
  8: ["bera-kavak", "Bera Kavak"],
  10: ["bera-milan", "Bera Milan"],
  11: ["bera-runner", "Bera Runner"],
  12: ["bera-cobra", "Bera Cobra"],
  13: ["bera-bwt", "Bera BWT"],
  15: ["ek-xpress-lite", "EK Xpress Lite"],
  16: ["ek-xpress-rayo", "EK Xpress Rayo"],
  17: ["ek-xpress-paleta", "EK Xpress Paleta"],
  18: ["ek-xpress-paleta-ii", "EK Xpress Paleta II"],
  19: ["ek-new-horte", "EK New Horte"],
  20: ["ek-owen", "EK Owen"],
  21: ["ek-owen-ii", "EK Owen II"],
  23: ["ek-matriz-ii", "EK Matriz II"],
  24: ["ek-new-outlook-ii", "EK New Outlook II"],
  26: ["md-aguila", "MD Águila"],
  27: ["md-lechuza", "MD Lechuza"],
  28: ["md-lechuza-ii", "MD Lechuza II"],
  29: ["md-cuervo", "MD Cuervo"],
  30: ["md-canario", "MD Canario"],
  31: ["md-condor", "MD Cóndor"],
  32: ["md-falco", "MD Falco"],
  34: ["ava-leopardo", "AVA Leopardo"],
  35: ["ava-leopardo-ii", "AVA Leopardo II"],
  36: ["ava-leon", "AVA León"],
  37: ["ava-mule", "AVA Mule"],
  38: ["ava-mustang", "AVA Mustang"],
  39: ["ava-pantera", "AVA Pantera"],
  40: ["ava-tigrito", "AVA Tigrito"],
  42: ["ava-avipon", "AVA Avipón"],
  43: ["ava-tucan", "AVA Tucán"],
  44: ["ava-flath", "AVA Flath"],
  46: ["toro-crx", "Toro CRX"],
  47: ["toro-jaguar", "Toro Jaguar"],
  48: ["toro-leon", "Toro León"],
  50: ["toro-cappuccino", "Toro Cappuccino"],
  51: ["toro-foxtr", "Toro Foxtr"],
  52: ["toro-tanktr", "Toro Tanktr"],
  53: ["toro-moka", "Toro Moka"],
  55: ["et-cuda-hero", "ET Cuda Hero"],
  56: ["et-cuda-m200", "ET Cuda M200"],
};

/** Agrupa los archivos por pagina. */
const porPagina = new Map();

for (const archivo of readdirSync(ORIGEN).filter((n) => n.startsWith("pagina-"))) {
  const numero = Number(archivo.match(/pagina-(\d+)/)?.[1] ?? 0);

  if (!porPagina.has(numero)) porPagina.set(numero, []);
  porPagina.get(numero).push(archivo);
}

const elegidas = [];
const descartadas = [];

for (const [pagina, archivos] of [...porPagina.entries()].sort((a, b) => a[0] - b[0])) {
  const modelo = MODELOS[pagina];

  // Se puntua cada imagen de la pagina y se queda la mejor: la que parece una moto.
  let mejor = null;

  for (const archivo of archivos) {
    const ruta = `${ORIGEN}/${archivo}`;
    const kb = Math.round(statSync(ruta).size / 1024);

    const stats = await sharp(ruta).stats();
    const brillo = stats.channels.slice(0, 3).reduce((t, c) => t + c.mean, 0) / 3;
    const desv = stats.channels.slice(0, 3).reduce((t, c) => t + c.stdev, 0) / 3;

    // Una moto recortada sobre blanco: fondo claro y contenido con variedad.
    const puntuacion = brillo > 120 && desv > 35 ? brillo + desv : -1;

    if (!mejor || puntuacion > mejor.puntuacion) {
      mejor = { archivo, kb, brillo, desv, puntuacion };
    }
  }

  if (!modelo) {
    descartadas.push(`pagina ${pagina}: sin modelo asignado (${archivos.join(", ")})`);
    continue;
  }

  if (!mejor || mejor.puntuacion < 0) {
    descartadas.push(`pagina ${pagina} (${modelo[1]}): ninguna imagen parece una moto`);
    continue;
  }

  const [slug] = modelo;

  await sharp(`${ORIGEN}/${mejor.archivo}`)
    .resize(900, 900, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, effort: 5 })
    .toFile(`${DESTINO}/${slug}.webp`);

  elegidas.push({ pagina, slug, nombre: modelo[1], archivo: mejor.archivo, brillo: mejor.brillo });
}

console.log(`fotos generadas: ${elegidas.length}`);

for (const e of elegidas.slice(0, 14)) {
  console.log(`  p${String(e.pagina).padStart(2)} -> ${e.slug.padEnd(22)} (${e.archivo}, brillo ${e.brillo.toFixed(0)})`);
}

if (descartadas.length) {
  console.log(`\ndescartadas: ${descartadas.length}`);
  for (const d of descartadas) console.log(`  ${d}`);
}