import { NextResponse } from "next/server";
import { parseCspReports } from "@/lib/csp-report.mjs";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { extractClientIp, extractUserAgent } from "@/lib/request-info.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tope del cuerpo. Un informe real no llega a 1 KB. */
const MAX_BODY_BYTES = 64 * 1024;

/**
 * Colector de informes de CSP (`docs/SEGURIDAD_INTEGRAL.md` 9.1).
 *
 * La politica estricta viaja en modo informe (`Content-Security-Policy-Report-Only`):
 * el navegador la evalua y manda aqui lo que **habria** bloqueado. Sin este
 * endpoint la politica no serviria de nada, porque nadie se enteraria de las
 * violaciones.
 *
 * Es una ruta publica **a proposito**: los navegadores envian los informes sin
 * credenciales, asi que exigir sesion los descartaria todos. A cambio:
 *  - solo acepta POST y responde siempre `204` (sin cuerpo);
 *  - el cuerpo esta acotado y el contenido se filtra a una lista cerrada de campos;
 *  - hay rate limiting por IP;
 *  - lo que llega se guarda como **telemetria**, nunca se ejecuta ni se devuelve.
 */
export async function POST(request: Request) {
  // El limite se comprueba antes de leer el cuerpo: no se gasta memoria en lo que
  // se va a descartar.
  const limite = await checkRateLimit("cspReport", { request });

  if (!limite.allowed) {
    // A un informe no se le responde con error: el navegador no hace nada util con
    // eso y lo unico que se consigue es llenarle la consola al visitante.
    return new NextResponse(null, { status: 204 });
  }

  const declarado = Number(request.headers.get("content-length") ?? 0);

  if (Number.isFinite(declarado) && declarado > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  let payload: unknown = null;

  try {
    const texto = await request.text();

    if (texto.length > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 413 });
    }

    payload = JSON.parse(texto);
  } catch {
    // Un informe ilegible no es un fallo del servidor: se descarta en silencio.
    return new NextResponse(null, { status: 204 });
  }

  const informes = parseCspReports(payload);

  if (informes.length > 0) {
    const getHeader = (nombre: string) => request.headers.get(nombre);
    const ip = extractClientIp(getHeader) || null;
    const userAgent = extractUserAgent(getHeader) || null;

    try {
      // Se inserta **una por una** a proposito: `createMany` queda envuelto en una
      // transaccion y el pooler de Supabase la rechaza ("Unable to start a
      // transaction in the given time"). Un `create` suelto es una sola sentencia.
      // Son como mucho 20 filas por peticion, asi que el coste es asumible.
      for (const informe of informes) {
        await prisma.cspViolation.create({ data: { ...informe, ip, userAgent } });
      }
    } catch (error) {
      // Telemetria best-effort: si no se puede guardar, el visitante no se entera.
      console.error("[csp-report] No se pudo registrar el informe", error);
    }
  }

  return new NextResponse(null, { status: 204 });
}
