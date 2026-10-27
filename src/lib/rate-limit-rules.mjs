/**
 * Reglas de rate limiting (modulo PURO y testeable).
 *
 * Los limites viven aqui, separados del backend de contadores (`rate-limit.ts`),
 * para poder probarlos sin Cloudflare ni red.
 *
 * Ver `docs/SEGURIDAD_INTEGRAL.md` seccion 7.3.
 */

/**
 * Limites por endpoint. Cada endpoint puede limitar por IP y por identidad
 * (usuario o correo): la primera frena el ataque desde un origen, la segunda el
 * distribuido.
 */
export const RATE_LIMIT_RULES = {
  login: {
    ip: { limit: 10, windowSeconds: 900 },
    identity: { limit: 5, windowSeconds: 900 },
  },
  license: {
    ip: { limit: 5, windowSeconds: 1800 },
    identity: { limit: 3, windowSeconds: 1800 },
  },
  register: {
    ip: { limit: 3, windowSeconds: 3600 },
  },
  registerMember: {
    ip: { limit: 30, windowSeconds: 3600 },
    identity: { limit: 15, windowSeconds: 3600 },
  },
  documentRead: {
    ip: { limit: 300, windowSeconds: 300 },
    identity: { limit: 120, windowSeconds: 300 },
  },
  expedienteRead: {
    ip: { limit: 60, windowSeconds: 300 },
    identity: { limit: 30, windowSeconds: 300 },
  },
  documentWrite: {
    ip: { limit: 40, windowSeconds: 300 },
    identity: { limit: 20, windowSeconds: 300 },
  },
  documentDelete: {
    ip: { limit: 20, windowSeconds: 300 },
    identity: { limit: 10, windowSeconds: 300 },
  },
  monitor: {
    ip: { limit: 200, windowSeconds: 300 },
    identity: { limit: 100, windowSeconds: 300 },
  },
  novedades: {
    ip: { limit: 60, windowSeconds: 300 },
    identity: { limit: 30, windowSeconds: 300 },
  },
  financiamiento: {
    ip: { limit: 20, windowSeconds: 300 },
    identity: { limit: 10, windowSeconds: 300 },
  },
};

/** Nombres de endpoint validos. */
export const RATE_LIMIT_NAMES = Object.keys(RATE_LIMIT_RULES);

/**
 * Claves de contador para un endpoint.
 *
 * @param {string} nombre endpoint (`login`, `license`, ...).
 * @param {{ ip?: string | null, identity?: string | null }} contexto
 * @returns {Array<{ key: string, limit: number, windowSeconds: number }>}
 */
export function reglasDe(nombre, contexto = {}) {
  const regla = RATE_LIMIT_RULES[nombre];

  if (!regla) return [];

  const claves = [];
  const ip = String(contexto.ip ?? "").trim() || "sin-ip";
  const identity = String(contexto.identity ?? "").trim().toLowerCase() || "anonimo";

  if (regla.ip) {
    claves.push({ key: `rl:${nombre}:ip:${ip}`, ...regla.ip });
  }

  if (regla.identity) {
    claves.push({ key: `rl:${nombre}:id:${identity}`, ...regla.identity });
  }

  return claves;
}

/**
 * Evalua una ventana fija a partir del contador actual.
 * Fail-closed: si `usados` no es un numero valido, se trata como agotado.
 *
 * @param {{ usados: number, limite: number, ventanaSegundos: number }} params
 */
export function evaluarVentana({ usados, limite, ventanaSegundos }) {
  const conteo = Number(usados);
  const tope = Number(limite);
  const ventana = Number(ventanaSegundos);

  if (!Number.isFinite(conteo) || !Number.isFinite(tope) || tope <= 0) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Number.isFinite(ventana) ? ventana : 60 };
  }

  const allowed = conteo < tope;

  return {
    allowed,
    remaining: Math.max(0, tope - conteo),
    retryAfterSeconds: allowed ? 0 : Math.max(1, ventana),
  };
}

/**
 * Combina los resultados de varias reglas: gana la mas restrictiva.
 *
 * @param {Array<{ allowed: boolean, remaining: number, retryAfterSeconds: number, key?: string }>} resultados
 */
export function combinarResultados(resultados) {
  const lista = Array.isArray(resultados) ? resultados : [];

  if (lista.length === 0) {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY, retryAfterSeconds: 0, bloqueadoPor: null };
  }

  let combinado = { allowed: true, remaining: Number.POSITIVE_INFINITY, retryAfterSeconds: 0, bloqueadoPor: null };

  for (const resultado of lista) {
    combinado.remaining = Math.min(combinado.remaining, resultado.remaining ?? 0);

    if (!resultado.allowed) {
      combinado.allowed = false;
      combinado.retryAfterSeconds = Math.max(combinado.retryAfterSeconds, resultado.retryAfterSeconds ?? 0);
      combinado.bloqueadoPor = combinado.bloqueadoPor ?? resultado.key ?? null;
    }
  }

  return combinado;
}
