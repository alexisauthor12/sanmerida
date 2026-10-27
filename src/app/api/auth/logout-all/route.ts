import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { ADMIN_ACCESS_COOKIE_NAME, AUTH_COOKIE_NAME } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cierra TODAS las sesiones de la cuenta.
 *
 * Incrementa `User.tokenVersion`, con lo que cualquier token emitido antes deja de
 * ser valido (incluida la licencia administrativa, que va ligada a esa version).
 * Es la respuesta correcta ante un robo de equipo o una cuenta comprometida: sin
 * esto, la sesion seguiria viva hasta su expiracion.
 */
export async function POST(request: Request) {
  const session = await requireSession();

  if (!session.ok) {
    return session.response;
  }

  try {
    await prisma.user.update({
      where: { id: session.user.userId },
      data: { tokenVersion: { increment: 1 } },
    });

    await recordAudit({
      action: "SESSION_REVOKED",
      actor: {
        userId: session.user.userId,
        email: session.user.email,
        role: session.user.role,
      },
      metadata: { alcance: "todas las sesiones" },
      request,
    });

    const response = NextResponse.json({
      ok: true,
      message: "Se cerraron todas tus sesiones. Vuelve a iniciar sesión.",
    });

    response.cookies.set({ name: AUTH_COOKIE_NAME, value: "", path: "/", maxAge: 0 });
    response.cookies.set({ name: ADMIN_ACCESS_COOKIE_NAME, value: "", path: "/", maxAge: 0 });

    return response;
  } catch (error) {
    console.error("[logout-all] No se pudo revocar la sesion:", error);

    return NextResponse.json(
      { ok: false, message: "No se pudieron cerrar las sesiones." },
      { status: 500 },
    );
  }
}
