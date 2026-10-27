import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { ADMIN_ACCESS_COOKIE_NAME, AUTH_COOKIE_NAME } from "@/lib/auth";
import { requireSession } from "@/lib/api-guard";
import { recordAudit } from "@/lib/audit";
import { validatePassword } from "@/lib/password-policy.mjs";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";

type Payload = {
  actual?: string;
  nueva?: string;
  confirmar?: string;
};

/**
 * Cambio de contrasena (`docs/SEGURIDAD_INTEGRAL.md` 7.5).
 *
 * Reglas:
 *  - Exige la contrasena **actual**: una sesion robada no basta para apropiarse de
 *    la cuenta (el atacante tendria que conocer la contrasena, no solo la cookie).
 *  - La nueva pasa por la politica (`password-policy.mjs`) y no puede ser la actual.
 *  - Al cambiarla se **incrementa `tokenVersion`**: todas las sesiones, incluida la
 *    de esta peticion, dejan de valer al instante. Por eso se borran las cookies y
 *    se pide volver a entrar.
 */
export async function POST(request: Request) {
  const session = await requireSession();

  if (!session.ok) {
    return session.response;
  }

  const limite = await checkRateLimit("passwordChange", {
    request,
    identity: session.user.userId,
  });

  if (!limite.allowed) {
    return tooManyRequests(limite.retryAfterSeconds);
  }

  const body = (await request.json().catch(() => ({}))) as Payload;
  const actual = String(body.actual ?? "");
  const nueva = String(body.nueva ?? "");
  const confirmar = String(body.confirmar ?? "");

  if (!actual || !nueva || !confirmar) {
    return NextResponse.json(
      { ok: false, message: "Completa la contraseña actual, la nueva y su confirmación." },
      { status: 400 },
    );
  }

  if (nueva !== confirmar) {
    return NextResponse.json(
      { ok: false, message: "La contraseña nueva y su confirmación no coinciden." },
      { status: 400 },
    );
  }

  const cuenta = await prisma.user.findUnique({
    where: { id: session.user.userId },
    select: { id: true, email: true, nombre: true, apellido: true, passwordHash: true },
  });

  if (!cuenta) {
    return NextResponse.json({ ok: false, message: "No encontramos tu cuenta." }, { status: 404 });
  }

  if (!(await bcrypt.compare(actual, cuenta.passwordHash))) {
    await recordAudit({
      action: "PASSWORD_CHANGED",
      actor: { userId: cuenta.id, email: cuenta.email, role: session.user.role },
      targetType: "User",
      targetId: cuenta.id,
      metadata: { motivo: "contrasena_actual_incorrecta" },
      success: false,
      request,
    });

    return NextResponse.json(
      { ok: false, message: "La contraseña actual no es correcta." },
      { status: 401 },
    );
  }

  // No reutilizacion: la nueva no puede ser la que ya tiene.
  if (await bcrypt.compare(nueva, cuenta.passwordHash)) {
    return NextResponse.json(
      { ok: false, message: "La contraseña nueva debe ser distinta de la actual." },
      { status: 400 },
    );
  }

  const politica = validatePassword(nueva, {
    nombre: cuenta.nombre,
    apellido: cuenta.apellido,
    email: cuenta.email,
  });

  if (!politica.ok) {
    return NextResponse.json(
      { ok: false, message: politica.message, faltantes: politica.faltantes },
      { status: 400 },
    );
  }

  const passwordHash = await bcrypt.hash(nueva, 12);

  await prisma.user.update({
    where: { id: cuenta.id },
    data: {
      passwordHash,
      passwordChangedAt: new Date(),
      // Revoca TODAS las sesiones, incluida esta.
      tokenVersion: { increment: 1 },
      // Y se limpia el bloqueo: acaba de demostrar que es ella.
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });

  await recordAudit({
    action: "PASSWORD_CHANGED",
    actor: { userId: cuenta.id, email: cuenta.email, role: session.user.role },
    targetType: "User",
    targetId: cuenta.id,
    metadata: { sesionesInvalidadas: true },
    request,
  });

  const response = NextResponse.json({
    ok: true,
    message: "Contraseña actualizada. Por seguridad cerramos todas tus sesiones: vuelve a entrar.",
    requiereNuevoLogin: true,
  });

  // La sesion ya no vale (se incremento `tokenVersion`): se borran las cookies aqui
  // mismo para que la interfaz no siga creyendo que hay sesion.
  for (const nombre of [AUTH_COOKIE_NAME, ADMIN_ACCESS_COOKIE_NAME]) {
    response.cookies.set({
      name: nombre,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}
