import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";

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
    });
  }

  const { user, licenseValidated } = session;
  const role = ROLE_CLIENTE[user.role] ?? "guest";

  return NextResponse.json({
    ok: true,
    authenticated: true,
    role,
    // `licenseValidated` ya comprueba scope, usuario y tokenVersion de la licencia.
    adminValidated: licenseValidated,
    adminTotalAccess: user.role === "ADMIN" && licenseValidated,
  });
}
