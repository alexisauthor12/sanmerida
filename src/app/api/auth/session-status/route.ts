import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_ACCESS_COOKIE_NAME, verifyAdminAccessToken } from "@/lib/auth";
import { getSessionUser } from "@/lib/session";

export async function GET() {
  const sessionUser = await getSessionUser();

  if (!sessionUser?.userId) {
    return NextResponse.json({
      ok: true,
      authenticated: false,
      role: "guest",
      adminValidated: false,
      adminTotalAccess: false,
    });
  }

  let adminValidated = false;

  try {
    const adminToken = (await cookies()).get(ADMIN_ACCESS_COOKIE_NAME)?.value;

    if (adminToken) {
      const payload = await verifyAdminAccessToken(adminToken);
      adminValidated = payload.scope === "admin_access" && payload.userId === String(sessionUser.userId);
    }
  } catch {
    adminValidated = false;
  }

  const role = sessionUser.isMember ? "member" : "account";

  return NextResponse.json({
    ok: true,
    authenticated: true,
    role,
    adminValidated,
    adminTotalAccess: role === "account" && adminValidated,
  });
}
