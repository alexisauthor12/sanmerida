import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { checkSecondFactor, SECOND_FACTOR_MESSAGE, TOTP_SELECT } from "@/lib/totp-service";

type DisablePayload = {
  password?: string;
  code?: string;
};

/**
 * Desactiva el segundo factor.
 *
 * Es una accion sensible, asi que no basta con tener la sesion: exige
 * **re-autenticacion** (contrasena) y ademas un codigo valido (de la app o uno de
 * recuperacion). Asi una cookie robada no permite apagar el 2FA.
 *
 * Rotar el secreto o los codigos de recuperacion se hace pasando por aqui y
 * volviendo a activarlo: el secreto viejo deja de ser valido.
 */
export async function POST(request: Request) {
  const session = await requireSession();

  if (!session.ok) {
    return session.response;
  }

  const body = (await request.json().catch(() => ({}))) as DisablePayload;

  const cuenta = await prisma.user.findUnique({
    where: { id: session.user.userId },
    select: { ...TOTP_SELECT, passwordHash: true },
  });

  if (!cuenta) {
    return NextResponse.json({ ok: false, message: "No encontramos tu cuenta." }, { status: 404 });
  }

  if (!cuenta.totpEnabled) {
    return NextResponse.json(
      { ok: false, message: "El segundo factor no está activo." },
      { status: 409 },
    );
  }

  const password = String(body.password ?? "");

  if (!password || !(await bcrypt.compare(password, cuenta.passwordHash))) {
    await recordAudit({
      action: "TOTP_CHALLENGE_FAILED",
      actor: { userId: cuenta.id, email: cuenta.email, role: session.user.role },
      targetType: "User",
      targetId: cuenta.id,
      metadata: { paso: "desactivacion", motivo: "password" },
      success: false,
      request,
    });

    return NextResponse.json({ ok: false, message: "Contraseña incorrecta." }, { status: 401 });
  }

  const factor = await checkSecondFactor(cuenta, body.code);

  if (!factor.ok) {
    await recordAudit({
      action: "TOTP_CHALLENGE_FAILED",
      actor: { userId: cuenta.id, email: cuenta.email, role: session.user.role },
      targetType: "User",
      targetId: cuenta.id,
      metadata: { paso: "desactivacion", motivo: factor.reason },
      success: false,
      request,
    });

    return NextResponse.json({ ok: false, message: SECOND_FACTOR_MESSAGE }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: cuenta.id },
    data: {
      totpEnabled: false,
      totpSecret: null,
      totpConfirmedAt: null,
      // `DbNull` es la forma correcta de dejar el JSON en NULL desde Prisma.
      totpRecoveryCodes: Prisma.DbNull,
    },
  });

  await recordAudit({
    action: "TOTP_DISABLED",
    actor: { userId: cuenta.id, email: cuenta.email, role: session.user.role },
    targetType: "User",
    targetId: cuenta.id,
    metadata: { viaRecovery: factor.viaRecovery },
    request,
  });

  return NextResponse.json({
    ok: true,
    message: "Segundo factor desactivado. Vuelve a activarlo para rotar el secreto.",
  });
}
