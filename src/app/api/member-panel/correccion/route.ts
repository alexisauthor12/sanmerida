import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { labelExpediente, recordAudit } from "@/lib/audit";
import { buildCorrectionRequest } from "@/lib/correction-request.mjs";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Derecho de rectificacion (`docs/SEGURIDAD_INTEGRAL.md` 10.2, punto 7).
 *
 * El miembro **pide** la correccion de un dato de su expediente; **no lo edita**.
 * La solicitud queda auditada (`CORRECCION_SOLICITADA`) y el equipo aplica el
 * cambio, que a su vez se audita como `EXPEDIENTE_UPDATE`. Asi queda rastro de
 * quien pidio que, quien lo cambio y cuando.
 *
 * El expediente se resuelve SIEMPRE por el `userId` de la sesion: no se acepta una
 * cedula por parametro, para que nadie pueda pedir correcciones sobre expedientes
 * ajenos.
 */
export async function POST(request: Request) {
  const session = await requireSession();

  if (!session.ok) {
    return session.response;
  }

  const body = (await request.json().catch(() => ({}))) as {
    campo?: unknown;
    detalle?: unknown;
  };

  const solicitud = buildCorrectionRequest(body);

  if (!solicitud.ok) {
    return NextResponse.json({ ok: false, message: solicitud.message }, { status: 400 });
  }

  const perfil = await prisma.memberProfile.findUnique({
    where: { userId: session.user.userId },
    select: { id: true, cedula: true },
  });

  if (!perfil) {
    // 404 uniforme: no confirma si existe un expediente asociado a la cuenta.
    return NextResponse.json(
      { ok: false, message: "No encontramos un expediente asociado a tu cuenta." },
      { status: 404 },
    );
  }

  await recordAudit({
    action: "CORRECCION_SOLICITADA",
    actor: {
      userId: session.user.userId,
      email: session.user.email,
      role: session.user.role,
    },
    targetType: "MemberProfile",
    targetId: perfil.id,
    targetLabel: labelExpediente(perfil.cedula),
    // El detalle es lo que el titular escribio: sin el, la solicitud no sirve de
    // nada. La auditoria lo recorta y solo la ve el equipo con licencia validada.
    metadata: { campo: solicitud.etiqueta, detalle: solicitud.detalle },
    request,
  });

  return NextResponse.json({
    ok: true,
    message: "Recibimos tu solicitud. El equipo revisará el dato y lo corregirá si procede.",
  });
}
