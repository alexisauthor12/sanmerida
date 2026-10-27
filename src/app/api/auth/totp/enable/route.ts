import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { generateRecoveryCodes, hashRecoveryCode, verifyTotpCode } from "@/lib/totp.mjs";
import { SECOND_FACTOR_MESSAGE } from "@/lib/totp-service";

type EnablePayload = {
  code?: string;
};

/**
 * Paso 2 de la activacion del segundo factor: el usuario demuestra que su app
 * autenticadora ya genera codigos validos para el secreto pendiente.
 *
 * Al confirmar se emiten los codigos de recuperacion, que son la salida de
 * emergencia si pierde el dispositivo. Se devuelven en claro UNA sola vez: en la
 * base solo quedan sus hashes SHA-256.
 */
export async function POST(request: Request) {
  const session = await requireSession();

  if (!session.ok) {
    return session.response;
  }

  const body = (await request.json().catch(() => ({}))) as EnablePayload;

  const cuenta = await prisma.user.findUnique({
    where: { id: session.user.userId },
    select: { id: true, email: true, totpEnabled: true, totpSecret: true },
  });

  if (!cuenta) {
    return NextResponse.json({ ok: false, message: "No encontramos tu cuenta." }, { status: 404 });
  }

  if (cuenta.totpEnabled) {
    return NextResponse.json(
      { ok: false, message: "El segundo factor ya estaba activo." },
      { status: 409 },
    );
  }

  if (!cuenta.totpSecret) {
    return NextResponse.json(
      { ok: false, message: "Genera primero el secreto del segundo factor." },
      { status: 400 },
    );
  }

  if (!(await verifyTotpCode(cuenta.totpSecret, String(body.code ?? "")))) {
    await recordAudit({
      action: "TOTP_CHALLENGE_FAILED",
      actor: { userId: cuenta.id, email: cuenta.email, role: session.user.role },
      targetType: "User",
      targetId: cuenta.id,
      metadata: { paso: "activacion" },
      success: false,
      request,
    });

    return NextResponse.json({ ok: false, message: SECOND_FACTOR_MESSAGE }, { status: 401 });
  }

  const codigos = generateRecoveryCodes();
  const hashes = await Promise.all(codigos.map((codigo) => hashRecoveryCode(codigo)));

  await prisma.user.update({
    where: { id: cuenta.id },
    data: {
      totpEnabled: true,
      totpConfirmedAt: new Date(),
      totpRecoveryCodes: hashes,
    },
  });

  await recordAudit({
    action: "TOTP_ENABLED",
    actor: { userId: cuenta.id, email: cuenta.email, role: session.user.role },
    targetType: "User",
    targetId: cuenta.id,
    metadata: { codigosRecuperacion: codigos.length },
    request,
  });

  return NextResponse.json({
    ok: true,
    message: "Segundo factor activado. Guarda los códigos de recuperación.",
    recoveryCodes: codigos,
  });
}
