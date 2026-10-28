import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { combinarResultados, evaluarVentana, reglasDe, siguienteConteo } from "@/lib/rate-limit-rules.mjs";
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
async function getKv(): Promise<KvNamespace | null> {
  try {
    // Variante **asincrona** a proposito. La sincrona lee de un almacen que no siempre
    // esta disponible y, cuando falla, devuelve un entorno vacio. Como aqui se captura
    // el fallo, el efecto era **silencioso**: el limitador caia al contador en memoria
    // sin que nadie se enterara.
    //
    // Aviso para quien venga despues: durante un tiempo se creyo que el KV no se usaba
    // en produccion porque el namespace aparecia **vacio**. Era una lectura equivocada.
    // Las claves del limitador llevan `expirationTtl` igual a la ventana (60-900 s), asi
    // que mirar el namespace un rato despues da vacio aunque todo funcione. Para
    // comprobar un binding hay que preguntar **desde dentro del Worker**:
    // `/api/salud/bindings` (seccion 7.1).
    const { env } = await getCloudflareContext({ async: true });
    const kv = (env as typeof env & { RATE_LIMIT?: KvNamespace }).RATE_LIMIT;

    return kv && typeof kv.get === "function" ? kv : null;
  } catch {
    return null;
  }
}

/** Aviso de que el limite no se comparte, para que no vuelva a pasar inadvertido. */
let avisoSinKvMostrado = false;

function avisarSinKv() {
  if (avisoSinKvMostrado || process.env.NODE_ENV === "development") return;

  avisoSinKvMostrado = true;

  console.error(
    "[rate-limit] El binding RATE_LIMIT no esta disponible: el limite se aplica por " +
      "instancia, no de forma compartida. Revisa la configuracion del Worker.",
  );
}

function backendDe(kv: KvNamespace | null): Backend {
  if (!kv) return backendMemoria;

  return {
    async incrementar(clave, ventanaSegundos) {
      // El final de la ventana viaja DENTRO del valor, no en el `expirationTtl`:
      // cada `put` reinicia ese TTL, asi que la ventana se alargaria con cada
      // intento y quien siguiera probando no saldria nunca del bloqueo. La logica
      // vive en `rate-limit-rules.mjs` para poder probarla sin KV ni red.
      const { conteo, expiraMs, restanteSegundos } = siguienteConteo({
        crudo: await kv.get(clave),
        ahoraMs: Date.now(),
        ventanaSegundos,
      });

      await kv.put(clave, `${conteo}|${expiraMs}`, { expirationTtl: restanteSegundos });

      return conteo;
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

  const kv = await getKv();

  if (!kv) avisarSinKv();

  const backend = backendDe(kv);

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
