import { NextResponse } from "next/server";
import { $Enums, Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { maskCedula } from "@/lib/security-helpers.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Consulta de la auditoria (`docs/SEGURIDAD_INTEGRAL.md` seccion 6.5).
 *
 * Solo ADMIN, con licencia administrativa validada (step-up). Devuelve las
 * entradas filtradas, un resumen por accion y por cuenta, y **alertas** derivadas
 * de los propios registros (descargas masivas, rachas de fallos, accesos fuera de
 * horario).
 *
 * La auditoria nunca guarda datos en claro: la cedula viaja enmascarada.
 */

const LIMITE_MAX = 200;
const LIMITE_POR_DEFECTO = 50;

/** Ventana de las alertas y umbrales. */
const VENTANA_ALERTA_MS = 60 * 60 * 1000;
const UMBRAL_DESCARGAS = 20;
const UMBRAL_FALLOS = 10;

/**
 * Las solicitudes de correccion de datos no son urgentes por hora, pero no se
 * pueden perder de vista: se cuentan los ultimos dias.
 */
const DIAS_CORRECCIONES = 7;

const ACCIONES = Object.values($Enums.AuditAction);

function fechaValida(valor: string | null): Date | null {
  if (!valor) return null;

  const fecha = new Date(valor);

  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function entero(valor: string | null, porDefecto: number, minimo: number, maximo: number) {
  const numero = Number(valor);

  if (!Number.isFinite(numero)) return porDefecto;

  return Math.min(maximo, Math.max(minimo, Math.trunc(numero)));
}

export async function GET(request: Request) {
  const access = await requirePermission("auditoria:read", { request });

  if (!access.ok) {
    return access.response;
  }

  const { searchParams } = new URL(request.url);
  const desde = fechaValida(searchParams.get("desde"));
  const hasta = fechaValida(searchParams.get("hasta"));
  const accion = (searchParams.get("accion") ?? "").trim();
  const actor = (searchParams.get("actor") ?? "").trim();
  const cedula = (searchParams.get("cedula") ?? "").replace(/\D/g, "");
  const resultado = (searchParams.get("resultado") ?? "").trim();
  const limite = entero(searchParams.get("limite"), LIMITE_POR_DEFECTO, 1, LIMITE_MAX);
  const offset = entero(searchParams.get("offset"), 0, 0, 1_000_000);

  const where: Prisma.AuditLogWhereInput = {};

  if (desde || hasta) {
    where.createdAt = {};

    if (desde) where.createdAt.gte = desde;
    if (hasta) where.createdAt.lte = hasta;
  }

  if (ACCIONES.includes(accion as $Enums.AuditAction)) {
    where.action = accion as $Enums.AuditAction;
  }

  if (actor) {
    where.actorEmail = { contains: actor, mode: "insensitive" };
  }

  // La cedula se busca por su etiqueta enmascarada (`***3017`), que es lo unico
  // que la auditoria guarda.
  if (cedula) {
    where.targetLabel = { contains: maskCedula(cedula) };
  }

  if (resultado === "ok") where.success = true;
  if (resultado === "denegado") where.success = false;

  try {
    const [total, registros, porAccion, porActor, recientes, correccionesPendientes] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limite,
        skip: offset,
        select: {
          id: true,
          action: true,
          actorEmail: true,
          actorRole: true,
          targetType: true,
          targetLabel: true,
          ip: true,
          userAgent: true,
          success: true,
          createdAt: true,
          metadata: true,
        },
      }),
      prisma.auditLog.groupBy({
        by: ["action"],
        where,
        _count: { _all: true },
        orderBy: { _count: { action: "desc" } },
        take: 15,
      }),
      prisma.auditLog.groupBy({
        by: ["actorEmail"],
        where,
        _count: { _all: true },
        orderBy: { _count: { actorEmail: "desc" } },
        take: 15,
      }),
      // Base de las alertas: actividad de la ultima hora, SIN los filtros de
      // fecha (una alerta no debe ocultarse porque el usuario filtre un rango).
      prisma.auditLog.findMany({
        where: { createdAt: { gte: new Date(Date.now() - VENTANA_ALERTA_MS) } },
        select: { action: true, actorEmail: true, success: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 2000,
      }),
      // Derecho de rectificacion: solicitudes del titular recientes. Sin esto
      // quedarian enterradas en la tabla y nadie las veria.
      prisma.auditLog.count({
        where: {
          action: "CORRECCION_SOLICITADA",
          createdAt: { gte: new Date(Date.now() - DIAS_CORRECCIONES * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    const alertas: Array<{ tipo: string; detalle: string; total: number }> = [];
    const descargas = new Map<string, number>();
    const fallos = new Map<string, number>();
    let fueraDeHorario = 0;

    for (const registro of recientes) {
      const cuenta = registro.actorEmail ?? "desconocido";

      if (registro.action === "DOCUMENTO_READ") {
        descargas.set(cuenta, (descargas.get(cuenta) ?? 0) + 1);
      }

      if (!registro.success) {
        fallos.set(cuenta, (fallos.get(cuenta) ?? 0) + 1);
      }

      const hora = registro.createdAt.getHours();

      if (hora >= 0 && hora < 6) fueraDeHorario += 1;
    }

    for (const [cuenta, cantidad] of descargas) {
      if (cantidad > UMBRAL_DESCARGAS) {
        alertas.push({
          tipo: "descargas_masivas",
          detalle: `${cuenta} descargó ${cantidad} documentos en la última hora`,
          total: cantidad,
        });
      }
    }

    for (const [cuenta, cantidad] of fallos) {
      if (cantidad > UMBRAL_FALLOS) {
        alertas.push({
          tipo: "fallos_repetidos",
          detalle: `${cuenta} acumuló ${cantidad} intentos fallidos en la última hora`,
          total: cantidad,
        });
      }
    }

    if (fueraDeHorario > 0) {
      alertas.push({
        tipo: "fuera_de_horario",
        detalle: `${fueraDeHorario} accesos entre las 00:00 y las 06:00 en la última hora`,
        total: fueraDeHorario,
      });
    }

    if (correccionesPendientes > 0) {
      alertas.push({
        tipo: "correcciones_pendientes",
        detalle: `${correccionesPendientes} solicitud(es) de corrección de datos en los últimos ${DIAS_CORRECCIONES} días`,
        total: correccionesPendientes,
      });
    }

    const formatoFecha = new Intl.DateTimeFormat("es-VE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    return NextResponse.json({
      ok: true,
      total,
      limite,
      offset,
      acciones: ACCIONES,
      entradas: registros.map((registro) => ({
        id: registro.id,
        accion: registro.action,
        actor: registro.actorEmail ?? "",
        rol: registro.actorRole ?? "",
        objetivo: registro.targetType ?? "",
        etiqueta: registro.targetLabel ?? "",
        ip: registro.ip ?? "",
        agente: registro.userAgent ?? "",
        exito: registro.success,
        fecha: formatoFecha.format(registro.createdAt),
        fechaIso: registro.createdAt.toISOString(),
        detalle: registro.metadata ?? null,
      })),
      resumen: {
        porAccion: porAccion.map((fila) => ({ accion: fila.action, total: fila._count._all })),
        porActor: porActor.map((fila) => ({
          actor: fila.actorEmail ?? "desconocido",
          total: fila._count._all,
        })),
      },
      alertas,
    });
  } catch (error) {
    console.error("[auditoria] No se pudo consultar la auditoria:", error);

    return NextResponse.json(
      { ok: false, message: "No se pudo consultar la auditoría." },
      { status: 500 },
    );
  }
}
