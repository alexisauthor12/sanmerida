/**
 * Extrae el catalogo PDF: texto de cada pagina y sus fotos, asociadas a su pagina.
 *
 *   node scripts/extraer-catalogo.mjs
 *
 * Deja las imagenes en `catalogo/fotos/` como `pagina-XX-YY.png` y una galeria para
 * verlas e identificarlas en `catalogo/galeria.html`.
 *
 * Usa `sharp` (ya es dependencia) para escribir las imagenes: escribir el PNG a mano
 * fue la fuente de todos los errores, porque hay que meter el byte de filtro delante de
 * cada fila y es facil olvidarlo.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import sharp from "sharp";

const PDF = "catalogo/CATALOGO SAN MERIDA DE JESUS ZAMBRANO (1).pdf";
const SALIDA = "catalogo/fotos";

mkdirSync(SALIDA, { recursive: true });

const bytes = readFileSync(PDF);
const texto = bytes.toString("latin1");

// --- Objetos del PDF --------------------------------------------------------
const objetos = new Map();

for (const m of texto.matchAll(/(\d+)\s+0\s+obj\b/g)) {
  const numero = Number(m[1]);
  const desde = m.index + m[0].length;
  const posStream = texto.indexOf("stream", desde);
  const posFin = texto.indexOf("endobj", desde);
  const conStream = posStream > 0 && (posFin < 0 || posStream < posFin);
  const dict = texto.slice(desde, conStream ? posStream : posFin);

  let stream = null;

  if (conStream) {
    const largo = Number(dict.match(/\/Length\s+(\d+)/)?.[1] ?? 0);

    // `stream` puede ir seguido de \n o de \r\n: si se salta uno de menos, el zlib
    // deja de descomprimir ("incorrect header check").
    let salto = 6;

    if (texto[posStream + 6] === "\r" && texto[posStream + 7] === "\n") salto = 8;
    else if (texto[posStream + 6] === "\r" || texto[posStream + 6] === "\n") salto = 7;

    if (largo > 0) stream = bytes.subarray(posStream + salto, posStream + salto + largo);
  }

  objetos.set(numero, { dict, stream });
}

function descomprimir(obj) {
  if (!obj?.stream) return "";

  try {
    return inflateSync(obj.stream).toString("latin1");
  } catch {
    return "";
  }
}

// --- Fuentes y recursos -----------------------------------------------------
/** Mapa codigo -> caracter, leyendo el ToUnicode de la fuente. */
function mapaDeFuente(numero) {
  const ref = objetos.get(numero)?.dict.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/);

  if (!ref) return null;

  const cmap = descomprimir(objetos.get(Number(ref[1])));
  const mapa = new Map();

  for (const bloque of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const par of bloque[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      let s = "";

      for (let i = 0; i < par[2].length; i += 4) {
        s += String.fromCharCode(parseInt(par[2].slice(i, i + 4), 16));
      }

      mapa.set(parseInt(par[1], 16), s);
    }
  }

  for (const bloque of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const r of bloque[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const desde = parseInt(r[1], 16);
      const hasta = parseInt(r[2], 16);
      const base = parseInt(r[3].slice(0, 4), 16);

      for (let c = desde; c <= hasta && c - desde < 500; c += 1) {
        mapa.set(c, String.fromCharCode(base + (c - desde)));
      }
    }
  }

  return mapa.size ? mapa : null;
}

/** Diccionario (directo o por referencia) -> nombre -> numero de objeto. */
function porNombre(valor) {
  const bruto = String(valor ?? "");
  const ref = bruto.match(/^\s*(\d+)\s+\d+\s+R/);
  const dict = ref ? (objetos.get(Number(ref[1]))?.dict ?? "") : bruto;
  const salida = new Map();

  for (const m of dict.matchAll(/\/([A-Za-z0-9+.#-]+)\s+(\d+)\s+\d+\s+R/g)) {
    salida.set(m[1], Number(m[2]));
  }

  return salida;
}

/** Fuentes y XObjects de un diccionario de recursos. */
function recursos(dict) {
  const bloque = dict.match(/\/Resources\s*(<<[\s\S]*?>>|\d+\s+\d+\s+R)/);

  if (!bloque) return { fuentes: new Map(), xobjects: new Map() };

  let cuerpo = bloque[1];
  const ref = cuerpo.match(/^\s*(\d+)\s+\d+\s+R/);

  if (ref) cuerpo = objetos.get(Number(ref[1]))?.dict ?? "";

  const fuentes = new Map();

  for (const [nombre, numero] of porNombre(cuerpo.match(/\/Font\s*(<<[\s\S]*?>>|\d+\s+\d+\s+R)/)?.[1])) {
    const mapa = mapaDeFuente(numero);

    if (mapa) fuentes.set(nombre, mapa);
  }

  return {
    fuentes,
    xobjects: porNombre(cuerpo.match(/\/XObject\s*(<<[\s\S]*?>>|\d+\s+\d+\s+R)/)?.[1]),
  };
}

// --- Imagenes ---------------------------------------------------------------
/** Deshace los filtros por fila (predictor PNG) que usan estos PDF. */
function deshacerPredictor(datos, ancho, alto, canales) {
  const fila = ancho * canales;
  const salida = Buffer.alloc(alto * fila);

  let anterior = Buffer.alloc(fila);

  for (let y = 0; y < alto; y += 1) {
    const tipo = datos[y * (fila + 1)];
    const actual = Buffer.from(datos.subarray(y * (fila + 1) + 1, y * (fila + 1) + 1 + fila));

    for (let i = 0; i < fila; i += 1) {
      const izq = i >= canales ? actual[i - canales] : 0;
      const arriba = anterior[i];
      const arribaizq = i >= canales ? anterior[i - canales] : 0;

      if (tipo === 1) actual[i] = (actual[i] + izq) & 0xff;
      else if (tipo === 2) actual[i] = (actual[i] + arriba) & 0xff;
      else if (tipo === 3) actual[i] = (actual[i] + ((izq + arriba) >> 1)) & 0xff;
      else if (tipo === 4) {
        const p = izq + arriba - arribaizq;
        const pa = Math.abs(p - izq);
        const pb = Math.abs(p - arriba);
        const pc = Math.abs(p - arribaizq);

        actual[i] = (actual[i] + (pa <= pb && pa <= pc ? izq : pb <= pc ? arriba : arribaizq)) & 0xff;
      }
    }

    actual.copy(salida, y * fila);
    anterior = actual;
  }

  return salida;
}

/** RGB de una imagen, compuesta sobre blanco y con su mascara aplicada. */
function rgbDe(numero, profundidad = 0) {
  const objeto = objetos.get(numero);

  if (!objeto?.stream || profundidad > 2) return null;

  const ancho = Number(objeto.dict.match(/\/Width\s+(\d+)/)?.[1] ?? 0);
  const alto = Number(objeto.dict.match(/\/Height\s+(\d+)/)?.[1] ?? 0);

  if (!ancho || !alto) return null;

  let datos;

  try {
    datos = inflateSync(objeto.stream);
  } catch {
    return null;
  }

  let canales = 0;
  let predictor = false;

  for (const c of [3, 4, 1]) {
    if (datos.length === alto * (ancho * c + 1)) {
      canales = c;
      predictor = true;
      break;
    }

    if (datos.length === ancho * alto * c) {
      canales = c;
      break;
    }
  }

  if (!canales) return null;

  if (predictor) datos = deshacerPredictor(datos, ancho, alto, canales);

  let alfa = null;

  if (canales === 4) {
    alfa = Buffer.alloc(ancho * alto);

    for (let i = 0; i < ancho * alto; i += 1) alfa[i] = datos[i * 4 + 3];
  } else {
    const ref = objeto.dict.match(/\/SMask\s+(\d+)\s+\d+\s+R/);
    const mascara = ref ? objetos.get(Number(ref[1])) : null;

    if (mascara?.stream) {
      const am = Number(mascara.dict.match(/\/Width\s+(\d+)/)?.[1] ?? 0);
      const hm = Number(mascara.dict.match(/\/Height\s+(\d+)/)?.[1] ?? 0);

      try {
        const dm = inflateSync(mascara.stream);

        if (am === ancho && hm === alto) {
          if (dm.length === ancho * alto) alfa = dm;
          else if (dm.length === alto * (ancho + 1)) alfa = deshacerPredictor(dm, ancho, alto, 1);
        }
      } catch {
        // sin mascara
      }
    }
  }

  // Sobre blanco: son recortes con fondo transparente y sobre negro no se ven.
  const rgb = Buffer.alloc(ancho * alto * 3);

  for (let i = 0; i < ancho * alto; i += 1) {
    const a = alfa ? alfa[i] / 255 : 1;

    for (let c = 0; c < 3; c += 1) {
      const color = canales >= 3 ? datos[i * canales + c] : datos[i];

      rgb[i * 3 + c] = Math.round(color * a + 255 * (1 - a));
    }
  }

  return { ancho, alto, rgb };
}

// --- Recorrer un flujo de contenido ----------------------------------------
/** Acumula texto y guarda imagenes; entra en los Form XObjects (ahi esta el texto). */
async function recorrer(numContenido, ctx, estado) {
  const contenido = descomprimir(objetos.get(numContenido));

  if (!contenido) return;

  const patron =
    /\/([A-Za-z0-9+.#-]+)\s+[\d.-]+\s+Tf|\(((?:\\.|[^\\()])*)\)\s*Tj|\[((?:[^\[\]]|\\.)*)\]\s*TJ|\/([A-Za-z0-9+.#-]+)\s+Do/g;

  for (const m of contenido.matchAll(patron)) {
    if (m[1]) {
      estado.fuente = ctx.fuentes.get(m[1]) ?? null;
      continue;
    }

    if (m[2] !== undefined || m[3] !== undefined) {
      const crudo =
        m[2] ?? [...m[3].matchAll(/\(((?:\\.|[^\\()])*)\)/g)].map((x) => x[1]).join("");

      if (estado.fuente) {
        let s = "";

        for (let i = 0; i + 1 < crudo.length; i += 2) {
          s += estado.fuente.get((crudo.charCodeAt(i) << 8) | crudo.charCodeAt(i + 1)) ?? "";
        }

        estado.lineas.push(s);
      }

      continue;
    }

    const numero = ctx.xobjects.get(m[4]);
    const xobj = numero ? objetos.get(numero) : null;

    if (!xobj) continue;

    if (/\/Subtype\s*\/Form/.test(xobj.dict)) {
      const anidado = recursos(xobj.dict);

      await recorrer(numero, { fuentes: anidado.fuentes, xobjects: anidado.xobjects }, estado);
      continue;
    }

    if (!/\/Subtype\s*\/Image/.test(xobj.dict)) continue;

    const ancho = Number(xobj.dict.match(/\/Width\s+(\d+)/)?.[1] ?? 0);
    const alto = Number(xobj.dict.match(/\/Height\s+(\d+)/)?.[1] ?? 0);

    if (ancho < 120 || alto < 120) continue;

    const rgb = rgbDe(numero);

    if (!rgb) continue;

    const nombre = `pagina-${String(estado.pagina).padStart(2, "0")}-${String(estado.imagenes.length + 1).padStart(2, "0")}.png`;

    await sharp(rgb.rgb, { raw: { width: rgb.ancho, height: rgb.alto, channels: 3 } })
      .png({ compressionLevel: 9 })
      .toFile(`${SALIDA}/${nombre}`);

    estado.imagenes.push({ archivo: nombre, ancho: rgb.ancho, alto: rgb.alto });
  }
}

// --- Todas las paginas ------------------------------------------------------
const paginas = [...objetos.entries()]
  .filter(([, o]) => /\/Type\s*\/Page(?![s\w])/.test(o.dict))
  .sort((a, b) => a[0] - b[0]);

const indice = [];

for (const [, pagina] of paginas) {
  const { fuentes, xobjects } = recursos(pagina.dict);
  const contenidos = [...pagina.dict.matchAll(/\/Contents\s+(\d+)\s+\d+\s+R/g)].map((m) =>
    Number(m[1]),
  );

  const estado = { pagina: indice.length + 1, imagenes: [], lineas: [], fuente: null };

  for (const ref of contenidos) {
    await recorrer(ref, { fuentes, xobjects }, estado);
  }

  const limpio = estado.lineas
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f]/g, "")
    .trim();

  indice.push({ pagina: estado.pagina, texto: limpio, imagenes: estado.imagenes });

  console.log(
    `pagina ${String(estado.pagina).padStart(2, "0")}: ${estado.imagenes.length} foto(s)  "${limpio.slice(0, 80)}"`,
  );
}

// --- Galeria ----------------------------------------------------------------
const escapar = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const secciones = indice
  .filter((p) => p.imagenes.length > 0)
  .map((p) => {
    const fotos = p.imagenes
      .map(
        (i) =>
          `<figure><img src="fotos/${i.archivo}" loading="lazy" alt="${i.archivo}">` +
          `<figcaption>${i.archivo}<br><small>${i.ancho}x${i.alto}</small></figcaption></figure>`,
      )
      .join("");

    return (
      `<section><h2>Pagina ${p.pagina}</h2>` +
      `<p class="txt">${p.texto ? escapar(p.texto.slice(0, 400)) : "<em>sin texto</em>"}</p>` +
      `<div class="fila">${fotos}</div></section>`
    );
  })
  .join("\n");

const total = indice.reduce((t, p) => t + p.imagenes.length, 0);

writeFileSync(
  "catalogo/galeria.html",
  `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Catalogo SAN Merida - fotos</title><style>
body{font-family:system-ui,sans-serif;background:#111;color:#eee;margin:0;padding:24px}
h1{font-weight:500}h2{font-size:15px;color:#9ae6b4;margin:0 0 6px}
section{border-top:1px solid #333;padding:18px 0}
.txt{color:#999;font-size:12px;margin:0 0 12px;max-width:900px}
.fila{display:flex;flex-wrap:wrap;gap:12px}
figure{margin:0;background:#1b1b1b;border:1px solid #2c2c2c;border-radius:8px;padding:8px}
img{display:block;width:190px;height:190px;object-fit:contain;background:#fff;border-radius:4px}
figcaption{font-size:11px;color:#888;margin-top:6px;text-align:center}
</style></head><body>
<h1>Catalogo SAN Merida - ${total} fotos en ${indice.filter((p) => p.imagenes.length).length} paginas</h1>
<p class="txt">Cada foto lleva el nombre de su pagina. Dime cual es cada modelo y las renombro.</p>
${secciones}
</body></html>`,
  "utf8",
);

console.log(`\nfotos: ${total} en ${SALIDA}/`);
console.log("galeria: catalogo/galeria.html");