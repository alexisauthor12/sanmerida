/**
 * Helpers puros del feed de novedades de la empresa (`/api/noticias`).
 *
 * Los comparten el panel del equipo (`DashboardClient`), la vista del feed
 * (`NoticiasView`) y las pruebas. Igual que el resto de la logica de dominio del
 * proyecto, este modulo no depende de React ni de la base de datos.
 */

/** Categorias oficiales del feed (deben coincidir con `/api/noticias`). */
export const CATEGORIAS_FEED = [
  "Corporativo",
  "Modelos",
  "Promociones",
  "Pagos",
  "Eventos",
  "Video",
];

/** Clases Tailwind de la etiqueta de cada categoria (tema oscuro del panel). */
export const CATEGORIA_CLASES = {
  Corporativo: "text-blue-400 bg-blue-400/10",
  Modelos: "text-emerald-400 bg-emerald-400/10",
  Promociones: "text-amber-400 bg-amber-400/10",
  Pagos: "text-violet-400 bg-violet-400/10",
  Eventos: "text-sky-400 bg-sky-400/10",
  Video: "text-rose-400 bg-rose-400/10",
};

const CLASE_POR_DEFECTO = "text-white/70 bg-white/10";

/** Clase de color de una categoria; nunca devuelve undefined. */
export function claseCategoria(categoria) {
  return CATEGORIA_CLASES[String(categoria ?? "").trim()] ?? CLASE_POR_DEFECTO;
}

/**
 * Etiqueta de tiempo relativo a partir de la fecha ISO del feed.
 *
 * @param {string} iso fecha ISO devuelta por la API (`fechaIso`).
 * @param {{ ahora?: Date, respaldo?: string }} [opciones]
 * @returns {string} "Ahora mismo" | "Hace N min" | "Hace N h" | "Ayer" |
 *   "Hace N días"; y para fechas de mas de 30 dias devuelve `respaldo`
 *   (por defecto "" para que el llamador use la fecha formateada del feed).
 */
export function tiempoRelativo(iso, opciones = {}) {
  const ahora = opciones.ahora ?? new Date();
  const respaldo = opciones.respaldo ?? "";
  const fecha = new Date(iso);

  if (Number.isNaN(fecha.getTime())) return respaldo;

  const minutos = Math.floor((ahora.getTime() - fecha.getTime()) / 60000);

  if (minutos < 0) return "Ahora mismo";
  if (minutos < 1) return "Ahora mismo";
  if (minutos < 60) return `Hace ${minutos} min`;

  const horas = Math.floor(minutos / 60);

  if (horas < 24) return `Hace ${horas} h`;

  const dias = Math.floor(horas / 24);

  if (dias === 1) return "Ayer";
  if (dias <= 30) return `Hace ${dias} días`;

  return respaldo;
}

/** Filtra publicaciones por categoria (sin distinguir mayusculas ni espacios). */
export function filtrarPorCategoria(posts, categoria) {
  const objetivo = String(categoria ?? "").trim().toLowerCase();

  if (!objetivo) return Array.isArray(posts) ? posts : [];

  return (Array.isArray(posts) ? posts : []).filter(
    (post) => String(post?.categoria ?? "").trim().toLowerCase() === objetivo,
  );
}

/**
 * Resumen real del feed a partir de las publicaciones recibidas.
 * Se calcula con lo que devolvio la API: nunca inventa cifras.
 */
export function resumirFeed(posts) {
  const lista = Array.isArray(posts) ? posts : [];
  const categorias = new Set();
  let ultimaFecha = null;

  for (const post of lista) {
    const categoria = String(post?.categoria ?? "").trim();

    if (categoria) categorias.add(categoria);

    const fecha = new Date(post?.fechaIso ?? "");

    if (Number.isNaN(fecha.getTime())) continue;

    if (!ultimaFecha || fecha.getTime() > ultimaFecha.getTime()) {
      ultimaFecha = fecha;
    }
  }

  return {
    total: lista.length,
    categorias: categorias.size,
    destacadas: lista.filter((post) => Boolean(post?.destacado)).length,
    ultimaFecha,
  };
}
