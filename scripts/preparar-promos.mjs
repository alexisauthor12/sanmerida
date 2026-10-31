/**
 * Prepara las imagenes del carrusel de promociones.
 *
 * Origen: `catalogo/flash/` (las que dejo el disenador; no viven en `public/` para no
 * engordar el bundle del Worker con PNG de 1,3 MB que nadie descarga).
 * Destino: `public/promos/`, en WebP y a un tamano util.
 *
 * El carrusel las muestra hasta 700 px de ancho, asi que 1000 px de lado mayor sobra
 * incluso en pantallas de alta densidad. Un PNG de 1,3 MB no puede viajar en la portada.
 */
import { mkdirSync, readdirSync, statSync } from "node:fs";
import sharp from "sharp";

const ORIGEN = "catalogo/flash";
const DESTINO = "public/promos";

mkdirSync(DESTINO, { recursive: true });

/** Archivo del disenador -> nombre final. */
const MAPA = [
  ["Logo.png", "slide-haciendo-suenos"],
  ["Ruleta de premios SAN MERIDA #1.png", "slide-ruleta"],
  ["ek-xpress.png", "slide-tu-moto"],
];

let antes = 0;
let despues = 0;

for (const [origen, slug] of MAPA) {
  const entrada = `${ORIGEN}/${origen}`;

  let peso = 0;

  try {
    peso = statSync(entrada).size;
  } catch {
    console.log(`FALTA: ${origen}`);
    continue;
  }

  antes += peso;

  const info = await sharp(entrada)
    .resize(1000, 1000, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 88, effort: 5 })
    .toFile(`${DESTINO}/${slug}.webp`);

  despues += info.size;

  console.log(
    `  ${slug.padEnd(22)} ${info.width}x${info.height}  ` +
      `${Math.round(peso / 1024)} KB -> ${Math.round(info.size / 1024)} KB`,
  );
}

console.log(`\ntotal: ${(antes / 1024 / 1024).toFixed(1)} MB -> ${(despues / 1024 / 1024).toFixed(2)} MB`);
console.log(`archivos en promos/: ${readdirSync(DESTINO).join(", ")}`);