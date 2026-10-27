import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { combinarResultados, evaluarVentana, reglasDe } from "@/lib/rate-limit-rules.mjs";
import { extractClientIp } from "@/lib/request-info.mjs";

/**
 * Rate limiting con ventana fija (`docs/SEGURIDAD_INTEGRAL.md` seccion 7).
 *
 * Backend:
 *  - **Cloudflare KV** (binding `RATE_LIMIT`) cuando esta disponible: es lo que
 *    usa produccion, porque los Workers no comparten memoria entre instancias.
 *  - **Map en memoria** cuando no lo esta (desarrollo local y pruebas).
 *
 * Si el backend falla, la peticion se permite (no se tumba el servicio) pero el
 * fallo se reporta al log. Los limites de negocio siguen aplicandose por ventana.
 */

type KvNamespace = {
  get: (clave: string) => Promise<string | null>;
  put: (clave: string, valor: string, opciones?: { expirationTtl?: number }) => Promise<void>;
};

type Backend = {
  incrementar: (clave: string, ventanaSegundos: number) => Promise<number>;
};

const memoria = new Map<string, { valor: number; expira: number }>();

const backendMemoria: Backend = {
  async incrementar(clave, ventanaSegundos) {
    const ahora = Date.now();
    const actual = memoria.get(clave);

    if (!actual || actual.expira <= ahora) {
      memoria.set(clave, { valor: 1, expira: ahora + ventanaSegundos * 1000 });

      return 1;
    }

    actual.valor += 1;

    return actual.valor;
  },
};

/** Binding de KV si el entorno lo expone; null en local. */
function getKv(): KvNamespace | null {
  try {
    const { env } = getCloudflareContext();
    const kv = (env as typeof env & { RATE_LIMIT?: KvNamespace }).RATE_LIMIT;

    return kv && typeof kv.get === "function" ? kv : null;
  } catch {
    return null;
  }
}

function backendDe(kv: KvNamespace | null): Backend {
  if (!kv) return backendMemoria;

  return {
    async incrementar(clave, ventanaSegundos) {
      const previo = Number(await kv.get(clave)) || 0;
      const siguiente = previo + 1;

      await kv.put(clave, String(siguiente), { expirationTtl: Math.max(60, ventanaSegundos) });

      return siguiente;
    },
  };
}

export type RateLimitCheck = {
  allowed: boolean;
  retryAfterSeconds: number;
  bloqueadoPor: string | null;
};

/**
 * Comprueba el limite de un endpoint.
 *
 * @param nombre endpoint declarado en `rate-limit-rules.mjs` (login, license, ...).
 * @param options.request peticion, para leer la IP real del cliente.
 * @param options.identity identificador de la cuenta (correo o usuario).
 */
export async function checkRateLimit(
  nombre: string,
  options: { request?: Request; identity?: string | null } = {},
): Promise<RateLimitCheck> {
  const getHeader = options.request
    ? (cabecera: string) => options.request?.headers.get(cabecera) ?? null
    : null;

  const reglas = reglasDe(nombre, {
    ip: extractClientIp(getHeader),
    identity: options.identity,
  });

  if (reglas.length === 0) {
    return { allowed: true, retryAfterSeconds: 0, bloqueadoPor: null };
  }

  const backend = backendDe(getKv());

  try {
    const resultados = [];

    for (const regla of reglas) {
      const usados = await backend.incrementar(regla.key, regla.windowSeconds);

      resultados.push({
        ...evaluarVentana({
          usados,
          limite: regla.limit,
          ventanaSegundos: regla.windowSeconds,
        }),
        key: regla.key,
      });
    }

    const combinado = combinarResultados(resultados);

    return {
      allowed: combinado.allowed,
      retryAfterSeconds: combinado.retryAfterSeconds,
      bloqueadoPor: combinado.bloqueadoPor,
    };
  } catch (error) {
    console.error("[rate-limit] No se pudo comprobar el limite", nombre, error);

    return { allowed: true, retryAfterSeconds: 0, bloqueadoPor: null };
  }
}

/**
 * Respuesta 429 uniforme. El cuerpo no revela si la cuenta existe ni cual de las
 * reglas (IP o identidad) fue la que se agoto.
 */
export function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    { ok: false, message: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." },
    { status: 429, headers: { "Retry-After": String(Math.max(1, retryAfterSeconds)) } },
  );
}
