import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  ADMIN_ACCESS_COOKIE_NAME,
  AUTH_COOKIE_NAME,
  verifyAdminAccessToken,
  verifySessionToken,
} from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/dashboard") && !pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const sessionUser = await verifySessionToken(token);

    if (pathname.startsWith("/admin")) {
      const adminToken = request.cookies.get(ADMIN_ACCESS_COOKIE_NAME)?.value;

      if (!adminToken) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }

      const adminAccess = await verifyAdminAccessToken(adminToken);
      const hasAdminAccess =
        adminAccess.scope === "admin_access" &&
        adminAccess.userId.length > 0 &&
        adminAccess.userId === String(sessionUser.userId ?? "");

      if (!hasAdminAccess) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }

    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
