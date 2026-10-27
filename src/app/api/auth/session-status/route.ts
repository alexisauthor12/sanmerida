import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Traduce el rol del sistema al valor que espera la interfaz. */
const ROLE_CLIENTE: Record<string, string> = {
  MEMBER: "member",
  ADMIN: "account",
  PROSPECT: "prospect",
};

/**
 * Estado de la sesion actual.
 *
 * Pasa por el guard (firma + `tokenVersion` + cuenta activa). Si no hay sesion
 * valida responde el estado de invitado con 200, para que la interfaz no tenga
 * que distinguir entre "sin sesion" y "error".
 */
export async function GET() {
  const session = await requireSession();

  if (!session.ok) {
    return NextResponse.json({
      ok: true,
      authenticated: false,
      role: "guest",
      adminValidated: false,
      adminTotalAccess: false,
      totpEnabled: false,
    });
  }

  const { user, licenseValidated } = session;
  const role = ROLE_CLIENTE[user.role] ?? "guest";

  // El segundo factor es una propiedad de la cuenta, no del token: se lee de la
  // base para que la interfaz sepa si debe ofrecer activarlo.
  const cuenta = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { totpEnabled: true },
  });

  return NextResponse.json({
    ok: true,
    authenticated: true,
    role,
    // `licenseValidated` ya comprueba scope, usuario y tokenVersion de la licencia.
    adminValidated: licenseValidated,
    adminTotalAccess: user.role === "ADMIN" && licenseValidated,
    totpEnabled: Boolean(cuenta?.totpEnabled),
  });
}
