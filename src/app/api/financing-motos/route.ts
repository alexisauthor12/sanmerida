import { NextResponse } from "next/server";
import { MOTOS } from "@/data/motos";
import { requirePermission } from "@/lib/api-guard";
import {
  computeFinancing,
  normalizeFinancingConfig,
} from "@/lib/moto-financing.mjs";
import { prisma } from "@/lib/prisma";

type FinancingPayloadItem = {
  motoSlug?: string;
  precioBase?: number | string;
  porcentajeInicial?: number | string;
  cuotasQuincenales?: number | string;
  montoCuota?: number | string;
  activo?: boolean;
};

// El control de acceso vive ahora en `api-guard.ts` (rol + step-up por permiso).

export async function GET() {
  // Los precios del financiamiento los ve cualquier cuenta con sesion.
  const access = await requirePermission("financiamiento:read");

  if (!access.ok) {
    return access.response;
  }

  try {
    const saved = await prisma.motoFinancing.findMany();
    const bySlug = new Map(saved.map((item) => [item.motoSlug, item]));

    const models = MOTOS.map((moto) => {
      const config = bySlug.get(moto.slug);

      return {
        slug: moto.slug,
        nombre: moto.nombre,
        imagen: moto.imagen,
        categoria: moto.categoria,
        guardado: Boolean(config),
        ...computeFinancing({
          precioBase: config?.precioBase ?? 0,
          porcentajeInicial: config?.porcentajeInicial ?? 50,
          cuotasQuincenales: config?.cuotasQuincenales ?? 12,
          montoCuota: config?.montoCuota ?? 0,
          activo: config?.activo ?? true,
        }),
      };
    });

    return NextResponse.json({ ok: true, models });
  } catch {
    return NextResponse.json(
      { ok: false, message: "No fue posible cargar la configuración de financiamiento." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  // Cambiar el financiamiento afecta a TODOS los contratos nuevos: permiso de
  // escritura + step-up (licencia administrativa validada).
  const access = await requirePermission("financiamiento:write", { request });

  if (!access.ok) {
    return access.response;
  }

  let body: { motos?: FinancingPayloadItem[] } = {};

  try {
    body = (await request.json()) as { motos?: FinancingPayloadItem[] };
  } catch {
    return NextResponse.json({ ok: false, message: "Cuerpo de la solicitud inválido." }, { status: 400 });
  }

  const items = Array.isArray(body.motos) ? body.motos : [];

  if (items.length === 0) {
    return NextResponse.json({ ok: false, message: "No enviaste ningún modelo para actualizar." }, { status: 400 });
  }

  try {
    const updated: string[] = [];

    for (const item of items) {
      const slug = String(item.motoSlug ?? "").trim();
      const moto = MOTOS.find((entry) => entry.slug === slug);

      if (!moto) {
        continue;
      }

      const config = normalizeFinancingConfig(item);
      const data = {
        motoNombre: moto.nombre,
        precioBase: config.precioBase > 0 ? config.precioBase : null,
        porcentajeInicial: config.porcentajeInicial,
        cuotasQuincenales: config.cuotasQuincenales,
        montoCuota: config.montoCuota > 0 ? config.montoCuota : null,
        activo: config.activo,
      };

      await prisma.motoFinancing.upsert({
        where: { motoSlug: slug },
        update: data,
        create: { motoSlug: slug, ...data },
      });

      updated.push(slug);
    }

    if (updated.length === 0) {
      return NextResponse.json(
        { ok: false, message: "Ninguno de los modelos enviados existe en el catálogo." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Financiamiento guardado para ${updated.length} modelo(s).`,
      updated,
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "No fue posible guardar el financiamiento." },
      { status: 500 },
    );
  }
}
