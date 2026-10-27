import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import {
  ADMIN_ACCESS_COOKIE_NAME,
  createAdminAccessToken,
} from "@/lib/auth";
import { getAdminSecurityConfig } from "@/lib/admin-config";
import { recordAudit } from "@/lib/audit";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";

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

  // La licencia es un step-up: exige una sesion valida ya iniciada (firma +
  // tokenVersion + cuenta activa). Antes se comprobaba la sesion a mano.
  const session = await requireSession();

  if (!session.ok) {
    return session.response;
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
  if (session.user.role !== "ADMIN") {
    await recordAudit({
      action: "ADMIN_LICENSE_FAILED",
      actor: {
        userId: session.user.userId,
        email: session.user.email,
        role: session.user.role,
      },
      metadata: { motivo: "rol" },
      success: false,
      request,
    });

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
    sub: session.user.userId,
    email: session.user.email,
    // Ligada a esta sesion: un logout global invalida tambien la licencia.
    tokenVersion: session.user.tokenVersion,
  });

  response.cookies.set({
    name: ADMIN_ACCESS_COOKIE_NAME,
    value: adminAccessToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // La licencia es un step-up de corta duracion (4 h), no una sesion.
    maxAge: 60 * 60 * 4,
  });

  await recordAudit({
    action: "ADMIN_LICENSE_SUCCESS",
    actor: {
      userId: session.user.userId,
      email: session.user.email,
      role: session.user.role,
    },
    metadata: { duracionHoras: 4 },
    request,
  });

  return response;
}
