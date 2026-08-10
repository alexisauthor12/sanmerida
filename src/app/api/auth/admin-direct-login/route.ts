import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, createSessionToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isBcryptHash } from "@/lib/security-helpers.mjs";

type DirectAdminPayload = {
  username?: string;
  license?: string;
};

function normalizeEnvValue(value?: string) {
  return value?.trim().replace(/^['"]|['"]$/g, "") ?? "";
}

function getRequiredEnv(name: "ADMIN_USERNAME" | "ADMIN_ACCOUNT_EMAIL") {
  const value = normalizeEnvValue(process.env[name]);

  if (!value) {
    if (process.env.NODE_ENV !== "production") {
      if (name === "ADMIN_USERNAME") return "san-root-x9";

      if (name === "ADMIN_ACCOUNT_EMAIL") {
        const fallbackFromList = normalizeEnvValue(process.env.ADMIN_ACCOUNT_EMAILS)
          .split(",")
          .map((item) => item.trim().toLowerCase())
          .find(Boolean);

        return fallbackFromList || "admin@sanmerida.com";
      }
    }

    throw new Error(`${name} no está configurado.`);
  }

  return value;
}

function getAdminLicenseConfig() {
  const licenseHash = normalizeEnvValue(process.env.ADMIN_LICENSE_HASH);

  if (licenseHash && isBcryptHash(licenseHash)) {
    return { mode: "hash" as const, value: licenseHash };
  }

  const plainLicense = normalizeEnvValue(process.env.ADMIN_LICENSE ?? process.env.ADMIN_LICENSE_PLAIN);

  if (plainLicense) {
    return { mode: "plain" as const, value: plainLicense };
  }

  if (process.env.NODE_ENV !== "production") {
    return { mode: "plain" as const, value: "SAN-ADMIN-BF22F1962AF8D83C" };
  }

  if (licenseHash) {
    throw new Error("ADMIN_LICENSE_HASH inválido. Usa comillas simples o define ADMIN_LICENSE.");
  }

  throw new Error("Falta ADMIN_LICENSE_HASH o ADMIN_LICENSE.");
}

function getAdminConfig() {
  const username = getRequiredEnv("ADMIN_USERNAME");
  const accountEmail = getRequiredEnv("ADMIN_ACCOUNT_EMAIL").toLowerCase();
  const licenseConfig = getAdminLicenseConfig();

  return {
    username,
    licenseConfig,
    accountEmail,
  };
}

export async function POST(request: Request) {
  let adminConfig: ReturnType<typeof getAdminConfig>;

  try {
    adminConfig = getAdminConfig();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Configuración de acceso administrativo incompleta." },
      { status: 500 },
    );
  }

  const body = (await request.json()) as DirectAdminPayload;
  const username = body.username?.trim() ?? "";
  const license = body.license?.trim() ?? "";

  if (!username || !license) {
    return NextResponse.json(
      { ok: false, message: "Ingresa usuario admin y licencia." },
      { status: 400 },
    );
  }

  if (username !== adminConfig.username) {
    return NextResponse.json(
      { ok: false, message: "Usuario administrativo inválido." },
      { status: 401 },
    );
  }

  const validLicense =
    adminConfig.licenseConfig.mode === "hash"
      ? await bcrypt.compare(license, adminConfig.licenseConfig.value)
      : license === adminConfig.licenseConfig.value;

  if (!validLicense) {
    return NextResponse.json(
      { ok: false, message: "Licencia administrativa inválida." },
      { status: 401 },
    );
  }

  try {
    let accountUser = await prisma.user.findUnique({ where: { email: adminConfig.accountEmail } });

    if (!accountUser) {
      const tempPassword = `Adm!${Math.random().toString(36).slice(2, 10)}#`;
      const passwordHash = await bcrypt.hash(tempPassword, 12);

      accountUser = await prisma.user.create({
        data: {
          nombre: "Admin",
          apellido: "Root",
          email: adminConfig.accountEmail,
          telefono: "0000000000",
          passwordHash,
          isMember: false,
        },
      });
    }

    const sessionToken = await createSessionToken({
      sub: accountUser.id,
      email: accountUser.email,
      nombre: accountUser.nombre,
      isMember: false,
    });

    const response = NextResponse.json({
      ok: true,
      message: "Sesión administrativa iniciada. Validando licencia...",
      accountEmail: accountUser.email,
    });

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: sessionToken,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "No se pudo conectar con la base de datos para sesión admin. Verifica DATABASE_URL y reinicia el servidor.",
      },
      { status: 500 },
    );
  }
}
