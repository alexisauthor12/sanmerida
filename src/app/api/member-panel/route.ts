import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { buildAssetUrl } from "@/lib/asset-paths.mjs";
import { labelExpediente, recordAudit } from "@/lib/audit";
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

// La licencia administrativa ya no se comprueba aqui: es un step-up que aplica
// `api-guard.ts` segun el permiso requerido (ver docs/SEGURIDAD_INTEGRAL.md 5.4).


/**
 * Panel del miembro: devuelve el expediente completo (plan, cuotas, pagos,
 * documentos y contratos).
 *
 * Uso:
 *   GET /api/member-panel                    (miembro: SU propio expediente)
 *   GET /api/member-panel?cedula=31033017    (ADMIN: el expediente que indique)
 *
 * El acceso lo decide el **rol** (`authz.mjs`), no la posesion de la licencia:
 *  - Sin `cedula`: exige `expediente:read:own`, y el `own` se resuelve por el
 *    `userId` de la sesion, nunca por un parametro de la peticion.
 *  - Con `cedula`: exige `expediente:read:any` (solo ADMIN).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cedula = sanitizeCedula(searchParams.get("cedula") ?? "");

  const include = {
    installmentPayments: { orderBy: { paymentDate: "desc" as const } },
    advancePayments: { orderBy: { paymentDate: "desc" as const } },
    assets: true,
  };

  let profile = null;
  let actor: { userId: string; email: string; role: string } | null = null;

  if (cedula) {
    const access = await requirePermission("expediente:read:any", { request });

    if (!access.ok) {
      return access.response;
    }

    actor = { userId: access.user.userId, email: access.user.email, role: access.user.role };

    profile = await prisma.memberProfile.findUnique({ where: { cedula }, include });
  } else {
    const access = await requirePermission("expediente:read:own", { request });

    if (!access.ok) {
      return access.response;
    }

    actor = { userId: access.user.userId, email: access.user.email, role: access.user.role };

    profile = await prisma.memberProfile.findFirst({
      where: { userId: access.user.userId },
      include,
    });
  }

  await recordAudit({
    action: "EXPEDIENTE_READ",
    actor,
    targetType: "MemberProfile",
    targetId: profile?.id ?? null,
    targetLabel: labelExpediente(cedula || profile?.cedula || ""),
    metadata: { propio: !cedula },
    request,
  });

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
      email: profile.email ?? actor?.email ?? "",
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
