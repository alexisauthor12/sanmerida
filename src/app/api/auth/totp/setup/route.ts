import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { buildOtpAuthUri, formatTotpSecret, generateTotpSecret, TOTP_DIGITOS, TOTP_PERIODO_SEGUNDOS } from "@/lib/totp.mjs";

/**
 * Paso 1 de la activacion del segundo factor (`docs/SEGURIDAD_INTEGRAL.md` 12.2).
 *
 * Genera un secreto nuevo y lo deja **pendiente**: `totpEnabled` sigue en false
 * hasta que el usuario demuestre que su app autenticadora lo tiene bien cargado
 * (`/api/auth/totp/enable`). Asi nadie se queda fuera por un secreto mal copiado.
 *
 * Cada cuenta gestiona el suyo: basta con una sesion valida.
 */
export async function POST() {
  const session = await requireSession();

  if (!session.ok) {
    return session.response;
  }

  const cuenta = await prisma.user.findUnique({
    where: { id: session.user.userId },
    select: { id: true, email: true, totpEnabled: true },
  });

  if (!cuenta) {
    return NextResponse.json({ ok: false, message: "No encontramos tu cuenta." }, { status: 404 });
  }

  if (cuenta.totpEnabled) {
    return NextResponse.json(
      {
        ok: false,
        message: "El segundo factor ya está activo. Desactívalo antes de generar uno nuevo.",
      },
      { status: 409 },
    );
  }

  const secret = generateTotpSecret();

  await prisma.user.update({
    where: { id: cuenta.id },
    data: { totpSecret: secret, totpConfirmedAt: null },
  });

  return NextResponse.json({
    ok: true,
    // El secreto se muestra UNA vez. Si el usuario no llega a confirmarlo, se
    // sobrescribe la proxima vez que vuelva a empezar.
    secret,
    secretFormateado: formatTotpSecret(secret),
    otpauthUri: buildOtpAuthUri({ secret, accountName: cuenta.email }),
    digitos: TOTP_DIGITOS,
    periodo: TOTP_PERIODO_SEGUNDOS,
  });
}
