import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { labelExpediente, recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
// Datos de expediente: nunca se cachean.
export const dynamic = "force-dynamic";
export const revalidate = 0;

function sanitizeCedula(value: string) {
  return value.replace(/[^0-9]/g, "");
}

/**
 * Expediente completo de un miembro.
 *
 * Exige el permiso `expediente:read:any`, que solo tiene ADMIN. Antes bastaba con
 * tener una sesion cualquiera: una cuenta recien creada en `/register` podia leer
 * la cedula, la direccion, la geolocalizacion y las referencias de cualquier
 * persona (hallazgo B de `docs/SEGURIDAD_INTEGRAL.md`).
 */
export async function GET(request: Request) {
  const access = await requirePermission("expediente:read:any", { request });

  if (!access.ok) {
    return access.response;
  }

  const { searchParams } = new URL(request.url);
  const cedula = sanitizeCedula(searchParams.get("cedula") ?? "");

  if (!cedula) {
    return NextResponse.json({ ok: false, message: "Debes indicar la cédula." }, { status: 400 });
  }

  const profile = await prisma.memberProfile.findUnique({
    where: { cedula },
    include: {
      assets: true,
      user: {
        select: {
          id: true,
          nombre: true,
          apellido: true,
          email: true,
          telefono: true,
          isMember: true,
        },
      },
    },
  });

  await recordAudit({
    action: "EXPEDIENTE_READ",
    actor: {
      userId: access.user.userId,
      email: access.user.email,
      role: access.user.role,
    },
    targetType: "MemberProfile",
    targetId: profile?.id ?? null,
    targetLabel: labelExpediente(cedula),
    metadata: { encontrado: Boolean(profile) },
    request,
  });

  if (!profile) {
    return NextResponse.json({
      ok: true,
      found: false,
      message: "No existe expediente para esa cédula.",
    });
  }

  return NextResponse.json({ ok: true, found: true, profile });
}
