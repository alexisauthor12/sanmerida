import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requirePermission } from "@/lib/api-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Diagnostico de los bindings del Worker.
 *
 * Existe por un caso concreto: el limitador de peticiones decia usar Cloudflare KV
 * y en realidad caia a un contador en memoria — cada instancia llevaba su propia
 * cuenta, asi que el limite real era varias veces el documentado. El fallo era
 * invisible desde fuera: el namespace estaba vacio y la aplicacion funcionaba.
 *
 * Desde aqui se comprueba **desde dentro del Worker**, que es el unico sitio donde
 * la respuesta es la verdadera. Solo informa de presencia y de si la operacion
 * funciona: **nunca** devuelve valores, porque algunos bindings son credenciales.
 *
 * Permiso `usuario:manage`: es ADMIN con licencia validada. No se expone nada a
 * PROSPECT ni a MEMBER.
 */

type KvLike = {
  get: (clave: string) => Promise<string | null>;
  put: (clave: string, valor: string, opciones?: { expirationTtl?: number }) => Promise<void>;
  list: (opciones?: { prefix?: string; limit?: number }) => Promise<{ keys: { name: string }[] }>;
};

const NOMBRES_ESPERADOS = [
  "RATE_LIMIT",
  "HYPERDRIVE",
  "ASSETS",
  "WORKER_SELF_REFERENCE",
] as const;

/** True si el valor se comporta como un binding de KV. */
function pareceKv(valor: unknown): valor is KvLike {
  const v = valor as KvLike | undefined;

  return (
    typeof v === "object" &&
    v !== null &&
    typeof v.get === "function" &&
    typeof v.put === "function" &&
    typeof v.list === "function"
  );
}

export async function GET(request: Request) {
  const access = await requirePermission("usuario:manage", { request });

  if (!access.ok) {
    return access.response;
  }

  let env: Record<string, unknown> = {};
  let contexto = "no disponible";

  try {
    // Asincrona a proposito: la variante sincrona devuelve un entorno vacio en
    // silencio cuando el almacen no esta listo, que es justo el fallo que esta
    // ruta existe para detectar.
    const contextoCf = await getCloudflareContext({ async: true });

    env = contextoCf.env as unknown as Record<string, unknown>;
    contexto = "disponible";
  } catch (error) {
    contexto = `error: ${error instanceof Error ? error.message : "desconocido"}`;
  }

  const bindings: Record<string, string> = {};

  for (const nombre of NOMBRES_ESPERADOS) {
    bindings[nombre] = env[nombre] === undefined ? "AUSENTE" : "presente";
  }

  // Prueba real de ida y vuelta contra el KV del limitador.
  let pruebaKv = "no comprobado";

  if (pareceKv(env.RATE_LIMIT)) {
    const clave = `diag:${Date.now()}`;

    try {
      await env.RATE_LIMIT.put(clave, "ok", { expirationTtl: 60 });

      const leido = await env.RATE_LIMIT.get(clave);
      const listado = await env.RATE_LIMIT.list({ prefix: "diag:", limit: 5 });

      pruebaKv =
        leido === "ok"
          ? `escritura y lectura OK (${listado.keys.length} clave(s) de diagnostico visibles)`
          : `escritura hecha pero la lectura devolvio ${JSON.stringify(leido)}`;
    } catch (error) {
      pruebaKv = `FALLO: ${error instanceof Error ? error.message : "desconocido"}`;
    }
  } else if (env.RATE_LIMIT !== undefined) {
    pruebaKv = "el binding existe pero no se comporta como un KV";
  } else {
    pruebaKv =
      "el binding no llega al Worker: el limitador esta cayendo a un contador en memoria, " +
      "asi que el limite real es por instancia y no el documentado";
  }

  return NextResponse.json({
    ok: true,
    contexto,
    bindings,
    rateLimitKv: pruebaKv,
  });
}
