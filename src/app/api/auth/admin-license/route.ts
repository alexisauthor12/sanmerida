import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import {
  ADMIN_ACCESS_COOKIE_NAME,
  createAdminAccessToken,
} from "@/lib/auth";
import { getAdminSecurityConfig } from "@/lib/admin-config";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/session";

type AdminPayload = {
  username?: string;
  license?: string;
};

export async function POST(request: Request) {
  let securityConfig: ReturnType<typeof getAdminSecurityConfig>;

  try {
    securityConfig = getAdminSecurityConfig();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Configuración de seguridad administrativa incompleta." },
      { status: 500 }
    );
  }

  const sessionUser = await getSessionUser();

  if (!sessionUser?.userId) {
    return NextResponse.json({ ok: false, message: "Debes iniciar sesión para validar acceso de administrador." }, { status: 401 });
  }

  if (sessionUser.isMember && process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, message: "Tu perfil no tiene permisos para acceso administrativo." }, { status: 403 });
  }

  const body = (await request.json()) as AdminPayload;

  const username = body.username?.trim() ?? "";
  const license = body.license?.trim() ?? "";

  if (!username || !license) {
    return NextResponse.json(
      { ok: false, message: "Ingresa el usuario de administrador y la licencia." },
      { status: 400 }
    );
  }

  // La licencia es el step-up del sistema: limite estricto por IP y por usuario.
  const limite = await checkRateLimit("license", { request, identity: username });

  if (!limite.allowed) {
    await recordAudit({
      action: "RATE_LIMIT_BLOCK",
      metadata: { endpoint: "license" },
      success: false,
      request,
    });

    return tooManyRequests(limite.retryAfterSeconds);
  }

  if (username !== securityConfig.username) {
    return NextResponse.json(
      { ok: false, message: "Usuario de administrador inválido." },
      { status: 401 }
    );
  }

  const validLicense =
    securityConfig.licenseConfig.mode === "hash"
      ? await bcrypt.compare(license, securityConfig.licenseConfig.value)
      : license === securityConfig.licenseConfig.value;

  if (!validLicense) {
    return NextResponse.json(
      { ok: false, message: "Licencia inválida." },
      { status: 401 }
    );
  }

  // La licencia es un step-up: solo tiene sentido para una cuenta ADMIN.
  const cuenta = await prisma.user.findUnique({
    where: { id: String(sessionUser.userId) },
    select: { tokenVersion: true, role: true },
  });

  if (!cuenta || cuenta.role !== "ADMIN") {
    return NextResponse.json(
      { ok: false, message: "Tu cuenta no tiene el rol administrativo requerido." },
      { status: 403 }
    );
  }

  const response = NextResponse.json({
    ok: true,
    message: "Acceso de administrador validado correctamente.",
  });

  const adminAccessToken = await createAdminAccessToken({
    sub: String(sessionUser.userId),
    email: sessionUser.email,
    // Ligada a esta sesion: un logout global invalida tambien la licencia.
    tokenVersion: cuenta.tokenVersion,
  });

  response.cookies.set({
    name: ADMIN_ACCESS_COOKIE_NAME,
    value: adminAccessToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });

  return response;
}
