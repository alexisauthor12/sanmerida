import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import {
  ADMIN_ACCESS_COOKIE_NAME,
  createAdminAccessToken,
} from "@/lib/auth";
import { isBcryptHash } from "@/lib/security-helpers.mjs";
import { getSessionUser } from "@/lib/session";

function normalizeEnvValue(value?: string) {
  return value?.trim().replace(/^['"]|['"]$/g, "") ?? "";
}

function getRequiredEnv(name: "ADMIN_USERNAME" | "ADMIN_LICENSE_HASH") {
  const value = normalizeEnvValue(process.env[name]);

  if (!value) {
    if (process.env.NODE_ENV !== "production") {
      // Safe defaults for local development only
      if (name === "ADMIN_USERNAME") return "san-admin";
      if (name === "ADMIN_LICENSE_HASH") return "$2b$12$0ff2PFYoM4dCVZj8/P6A8eHnbki5dx9sgaBz77fVq.zFp8qs4ZDc6"; // bcrypt(SAN-ADMIN-0001)
    }
    throw new Error(`${name} no está configurado.`);
  }

  return value;
}

function getAdminSecurityConfig() {
  const username = getRequiredEnv("ADMIN_USERNAME");
  const licenseHash = normalizeEnvValue(process.env.ADMIN_LICENSE_HASH);
  const plainLicense = normalizeEnvValue(process.env.ADMIN_LICENSE ?? process.env.ADMIN_LICENSE_PLAIN);

  if (licenseHash && isBcryptHash(licenseHash)) {
    return {
      username,
      mode: "hash" as const,
      value: licenseHash,
    };
  }

  if (plainLicense) {
    return {
      username,
      mode: "plain" as const,
      value: plainLicense,
    };
  }

  if (process.env.NODE_ENV !== "production") {
    return {
      username,
      mode: "plain" as const,
      value: "SAN-ADMIN-BF22F1962AF8D83C",
    };
  }

  if (licenseHash) {
    throw new Error("ADMIN_LICENSE_HASH no tiene un formato bcrypt válido.");
  }

  throw new Error("Falta ADMIN_LICENSE_HASH o ADMIN_LICENSE.");

}

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

  if (username !== securityConfig.username) {
    return NextResponse.json(
      { ok: false, message: "Usuario de administrador inválido." },
      { status: 401 }
    );
  }

  const validLicense =
    securityConfig.mode === "hash"
      ? await bcrypt.compare(license, securityConfig.value)
      : license === securityConfig.value;

  if (!validLicense) {
    return NextResponse.json(
      { ok: false, message: "Licencia inválida." },
      { status: 401 }
    );
  }

  const response = NextResponse.json({
    ok: true,
    message: "Acceso de administrador validado correctamente.",
  });

  const adminAccessToken = await createAdminAccessToken({
    sub: String(sessionUser.userId),
    email: sessionUser.email,
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
