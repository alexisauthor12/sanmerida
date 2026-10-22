import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { MOTOS } from "@/data/motos";
import { ADMIN_ACCESS_COOKIE_NAME, verifyAdminAccessToken } from "@/lib/auth";
import {
  computeFinancing,
  normalizeFinancingConfig,
} from "@/lib/moto-financing.mjs";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type FinancingPayloadItem = {
  motoSlug?: string;
  precioBase?: number | string;
  porcentajeInicial?: number | string;
  cuotasQuincenales?: number | string;
  montoCuota?: number | string;
  activo?: boolean;
};

/**
 * Verifica el acceso. La lectura (GET) solo exige sesion: la usa el formulario
 * de registro. La escritura (POST) exige licencia administrativa en produccion.
 */
async function ensureAccess(options: { requireLicense: boolean }) {
  const isProduction = process.env.NODE_ENV === "production";
  const sessionUser = await getSessionUser();

  if (!sessionUser?.userId) {
    return NextResponse.json(
      { ok: false, message: "Debes iniciar sesión para gestionar el financiamiento." },
      { status: 401 },
    );
  }

  if (!options.requireLicense) {
    return { ok: true as const };
  }

  const adminToken = (await cookies()).get(ADMIN_ACCESS_COOKIE_NAME)?.value;

  if (!adminToken) {
    if (!isProduction) {
      return { ok: true as const };
    }

    return NextResponse.json(
      { ok: false, message: "Debes validar licencia administrativa para editar el financiamiento." },
      { status: 403 },
    );
  }

  try {
    const adminAccess = await verifyAdminAccessToken(adminToken);
    const hasAdminAccess =
      adminAccess.scope === "admin_access" &&
      adminAccess.userId.length > 0 &&
      adminAccess.userId === String(sessionUser.userId ?? "");

    if (!hasAdminAccess) {
      return NextResponse.json(
        { ok: false, message: "Acceso administrativo inválido o expirado." },
        { status: 403 },
      );
    }
  } catch {
    return NextResponse.json(
      { ok: false, message: "Acceso administrativo inválido o expirado." },
      { status: 403 },
    );
  }

  return { ok: true as const };
}

export async function GET() {
  const access = await ensureAccess({ requireLicense: false });
  if (access instanceof NextResponse) {
    return access;
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
  const access = await ensureAccess({ requireLicense: true });
  if (access instanceof NextResponse) {
    return access;
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
