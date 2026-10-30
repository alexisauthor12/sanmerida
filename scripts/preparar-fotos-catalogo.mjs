/**
 * Prepara las fotos del catalogo para la web.
 *
 * Los PNG extraidos del PDF pesan 25,6 MB entre 48 fotos: demasiado para una web, y mas
 * en un telefono con datos moviles. Aqui se recortan a un tamano util y se pasan a WebP,
 * que es lo que ya usa el resto del sitio.
 *
 * Deja el resultado en `public/catalogo/`.
 */
import { mkdirSync, readdirSync, statSync } from "node:fs";
import sharp from "sharp";

const ORIGEN = "catalogo/fotos";
const DESTINO = "public/catalogo";

mkdirSync(DESTINO, { recursive: true });

const archivos = readdirSync(ORIGEN).filter((n) => n.endsWith(".png")).sort();

let antes = 0;
let despues = 0;

for (const archivo of archivos) {
  const entrada = `${ORIGEN}/${archivo}`;
  const salida = `${DESTINO}/${archivo.replace(/\.png$/, ".webp")}`;

  antes += statSync(entrada).size;

  // 900 px de ancho: las tarjetas del carrusel miden ~400 y la ficha ~860. Mas seria
  // pagar peso por pixeles que nadie ve.
  await sharp(entrada)
    .resize(900, 900, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, effort: 5 })
    .toFile(salida);

  despues += statSync(salida).size;
}

console.log(`fotos: ${archivos.length}`);
console.log(`antes:   ${(antes / 1024 / 1024).toFixed(1)} MB`);
console.log(`despues: ${(despues / 1024 / 1024).toFixed(1)} MB`);
console.log(`ahorro:  ${(100 - (despues / antes) * 100).toFixed(0)}%`);