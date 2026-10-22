import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buildAssetUrl } from "@/lib/asset-paths.mjs";
import { ADMIN_ACCESS_COOKIE_NAME, verifyAdminAccessToken } from "@/lib/auth";
import {
  buildInstallments,
  buildPaidAmountMap,
  parseIsoOrNow,
  resolveInstallmentTotal,
  resolveIntervalDays,
  summarizeInstallments,
  toDmy,
} from "@/lib/installment-schedule.mjs";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";
// El panel del miembro siempre muestra datos frescos (cuotas y pagos al dia).
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Nombre legible de cada tipo de documento del expediente. */
const NOMBRES_DOCUMENTO: Record<string, string> = {
  identidad: "Cédula de identidad",
  rif: "RIF",
  licencia: "Licencia de conducir",
  "certificado-origen": "Certificado de origen",
  selfie: "Selfie de validación",
};

const TIPOS_DOCUMENTO: Record<string, string> = {
  identidad: "Identificación",
  selfie: "Identificación",
  rif: "Tributario",
  licencia: "Personal",
  "certificado-origen": "Vehículo",
};

const ORDEN_DOCUMENTO = ["identidad", "rif", "licencia", "certificado-origen", "selfie"];

function sanitizeCedula(value: string) {
  return value.replace(/[^0-9]/g, "");
}

/** El personal administrativo necesita la licencia validada para ver un panel ajeno. */
async function tieneLicenciaAdmin(userId: string) {
  const store = await cookies();
  const token = store.get(ADMIN_ACCESS_COOKIE_NAME)?.value;

  if (!token) return false;

  try {
    const payload = await verifyAdminAccessToken(token);

    return payload.scope === "admin_access" && payload.userId === userId;
  } catch {
    return false;
  }
}


/**
 * Panel del miembro: devuelve SOLO el expediente del propio cliente autenticado
 * (plan, cuotas, pagos, documentos y contratos). El personal administrativo
 * puede consultar un expediente concreto pasando `?cedula=` y su licencia.
 *
 * Uso:
 *   GET /api/member-panel                    (miembro: su propio expediente)
 *   GET /api/member-panel?cedula=31033017    (personal con licencia)
 */
export async function GET(request: Request) {
  const sessionUser = await getSessionUser();

  if (!sessionUser?.userId) {
    return NextResponse.json(
      { ok: false, message: "Debes iniciar sesión para ver tu panel." },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);

  const include = {
    installmentPayments: { orderBy: { paymentDate: "desc" as const } },
    advancePayments: { orderBy: { paymentDate: "desc" as const } },
    assets: true,
  };

  let profile = null;

  if (sessionUser.isMember) {
    profile = await prisma.memberProfile.findFirst({
      where: { userId: sessionUser.userId },
      include,
    });
  } else {
    if (!(await tieneLicenciaAdmin(sessionUser.userId))) {
      return NextResponse.json(
        { ok: false, message: "Valida la licencia administrativa para ver el panel de un miembro." },
        { status: 403 },
      );
    }

    const cedula = sanitizeCedula(searchParams.get("cedula") ?? "");

    if (!cedula) {
      return NextResponse.json({ ok: false, message: "Indica la cédula del miembro." }, { status: 400 });
    }

    profile = await prisma.memberProfile.findUnique({ where: { cedula }, include });
  }

  if (!profile) {
    return NextResponse.json({
      ok: true,
      found: false,
      message: "Todavía no hay un expediente asociado a este usuario.",
    });
  }

  const cuotaMensual = Number(profile.monthlyAmount ?? 0);
  const totalCuotas = resolveInstallmentTotal(profile.planName, profile.termMonths, profile.installmentCount);
  const intervaloDias = resolveIntervalDays(profile.planName, totalCuotas);
  const inicio = parseIsoOrNow(profile.contractStartDate ?? profile.createdAt.toISOString());
  const paidAmountByNumber = buildPaidAmountMap(profile.installmentPayments);

  const cuotas = buildInstallments({
    clientId: profile.id,
    cuotaMensual,
    total: totalCuotas,
    startDate: inicio,
    intervalDays: intervaloDias,
    paidAmountByNumber,
  });

  const abonos = profile.advancePayments.reduce((acc, item) => acc + item.amount, 0);
  const resumen = summarizeInstallments(cuotas, { cuotaMensual, abonos });


  // Documentos: una fila por tipo (se prefiere la version digitalizada).
  const documentosPorTipo = new Map<string, (typeof profile.assets)[number]>();

  for (const asset of profile.assets) {
    if (asset.assetType !== "DOCUMENT") continue;

    const clave = asset.documentKey.trim().toLowerCase();
    const actual = documentosPorTipo.get(clave);

    if (!actual || (asset.variant === "SCANNED" && actual.variant !== "SCANNED")) {
      documentosPorTipo.set(clave, asset);
    }
  }

  const documentos = [...documentosPorTipo.entries()]
    .sort(([claveA], [claveB]) => {
      const posicionA = ORDEN_DOCUMENTO.indexOf(claveA);
      const posicionB = ORDEN_DOCUMENTO.indexOf(claveB);

      return (
        (posicionA === -1 ? ORDEN_DOCUMENTO.length : posicionA) -
        (posicionB === -1 ? ORDEN_DOCUMENTO.length : posicionB)
      );
    })
    .map(([clave, asset]) => ({
      id: asset.id,
      nombre: NOMBRES_DOCUMENTO[clave] ?? clave.replace(/-/g, " ").replace(/^\w/, (letra) => letra.toUpperCase()),
      tipo: TIPOS_DOCUMENTO[clave] ?? "Soporte",
      fecha: toDmy(asset.createdAt),
      archivo: buildAssetUrl(asset.filePath),
    }));

  const contratos = profile.assets
    .filter((asset) => asset.assetType === "CONTRACT")
    .map((asset) => ({
      id: asset.id,
      nombre: profile.contractType || "Contrato",
      fecha: toDmy(profile.contractStartDate ? new Date(profile.contractStartDate) : asset.createdAt),
      archivo: buildAssetUrl(asset.filePath),
    }));


  return NextResponse.json({
    ok: true,
    found: true,
    member: {
      cedula: profile.cedula,
      nombre: `${profile.nombre ?? ""} ${profile.apellido ?? ""}`.trim() || `Cliente ${profile.cedula}`,
      nombrePila: profile.nombre ?? "",
      apellido: profile.apellido ?? "",
      email: profile.email ?? sessionUser.email ?? "",
      telefono: profile.telefono ?? "",
      direccion: profile.direccion ?? "",
      ocupacion: profile.ocupacion ?? "",
      empresa: profile.empresa ?? "",
      username: profile.username ?? "",
      miembroDesde: toDmy(profile.createdAt),
    },
    plan: {
      nombre: profile.planName ?? "Sin plan",
      cuotaMensual,
      totalCuotas,
      intervaloDias,
      inicio: toDmy(inicio),
      tipoContrato: profile.contractType ?? "Contrato",
      metodoPago: profile.paymentMethod ?? "",
      bancoPago: profile.paymentBank ?? "",
      referenciaPago: profile.paymentReference ?? "",
    },
    moto: {
      slug: profile.motoSlug ?? "",
      marca: profile.motoMarca ?? "",
      modelo: profile.motoModelo ?? "",
      imagen: profile.motoImagen ?? "",
      precio: Number(profile.motoUnitPrice ?? 0),
    },
    ubicacion: {
      lat: profile.ubicacionLat,
      lng: profile.ubicacionLng,
      link: profile.ubicacionLink ?? "",
    },
    resumen,
    cuotas,
    pagos: {
      cuotas: profile.installmentPayments.map((item) => ({
        id: item.id,
        cuota: item.installmentNumber,
        monto: Number(item.amount),
        fecha: toDmy(item.paymentDate),
        banco: item.bank,
        metodo: item.method,
        referencia: item.reference,
        nota: item.note ?? "",
      })),
      abonos: profile.advancePayments.map((item) => ({
        id: item.id,
        monto: Number(item.amount),
        fecha: toDmy(item.paymentDate),
        banco: item.bank,
        metodo: item.method,
        referencia: item.reference,
        nota: item.note ?? "",
      })),
    },
    documentos,
    contratos,
  });
}
