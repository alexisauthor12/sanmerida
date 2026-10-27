import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { createSessionToken, AUTH_COOKIE_NAME } from "@/lib/auth";
import type { Role } from "@/lib/authz.mjs";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { normalizeMemberUsername } from "@/lib/security-helpers.mjs";

type LoginPayload = {
  username?: string;
  email?: string;
  password?: string;
  encryptedKey?: string;
  portal?: "account" | "member";
};

const MEMBER_KEY_PATTERN = /^SAN-MEMBER-[A-Z0-9]{6}$/;

type SessionUser = {
  id: string;
  email: string;
  nombre: string;
  role: Role;
  tokenVersion: number;
};

function buildLoginResponse(user: SessionUser) {
  return createSessionToken({
    sub: user.id,
    email: user.email,
    nombre: user.nombre,
    role: user.role,
    tokenVersion: user.tokenVersion,
  }).then((token) => {
    const response = NextResponse.json({
      ok: true,
      message: "Bienvenido al sistema SAN.",
      role: user.role,
      isMember: user.role === "MEMBER",
    });

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    return response;
  });
}

function getDevelopmentFallbackUser(params: {
  portal: "account" | "member";
  normalizedUsername: string;
  email: string;
  credential: string;
}): SessionUser | null {
  // Blindaje fail-closed: las cuentas de prueba solo existen con
  // `NODE_ENV === "development"`. Antes bastaba con que NODE_ENV no fuera
  // "production", asi que un despliegue sin NODE_ENV definido dejaba activas
  // estas credenciales conocidas cuando la base de datos fallaba.
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  if (params.portal === "member") {
    if (params.normalizedUsername === "@san-admin" && params.credential === "SAN-MEMBER-ABC123") {
      return {
        id: "dev-member-san-admin",
        email: "san-admin@local",
        nombre: "SAN Admin",
        role: "MEMBER",
        tokenVersion: 1,
      };
    }
    return null;
  }

  if (params.email === "admin3@sanmerida.com" && params.credential === "Admin!456") {
    return {
      id: "dev-account-admin3",
      email: "admin3@sanmerida.com",
      nombre: "Admin",
      role: "ADMIN",
      tokenVersion: 1,
    };
  }

  if (params.email === "user2@sanmerida.com" && params.credential === "User!456") {
    return {
      id: "dev-account-user2",
      email: "user2@sanmerida.com",
      nombre: "Usuario",
      role: "ADMIN",
      tokenVersion: 1,
    };
  }

  return null;
}

export async function POST(request: Request) {
  const body = (await request.json()) as LoginPayload;
  const portal = body.portal ?? "account";

  const username = body.username?.trim().toLowerCase() ?? "";
  const normalizedUsername = normalizeMemberUsername(username);
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const encryptedKey = body.encryptedKey ?? "";
  const credential = portal === "member" ? encryptedKey : password;

  // Rate limiting antes de tocar la base de datos: frena la fuerza bruta y el
  // credential stuffing. Se limita por IP y por identidad.
  const limite = await checkRateLimit("login", {
    request,
    identity: portal === "member" ? normalizedUsername : email,
  });

  if (!limite.allowed) {
    await recordAudit({
      action: "RATE_LIMIT_BLOCK",
      metadata: { endpoint: "login", portal },
      success: false,
      request,
    });

    return tooManyRequests(limite.retryAfterSeconds);
  }

  if (portal === "member" && (!username || !credential)) {
    return NextResponse.json(
      {
        ok: false,
        message: "Completa usuario y clave encriptada.",
      },
      { status: 400 },
    );
  }

  if (portal !== "member" && (!email || !credential)) {
    return NextResponse.json(
      {
        ok: false,
        message: "Completa correo y contrasena.",
      },
      { status: 400 },
    );
  }

  if (portal === "member" && !MEMBER_KEY_PATTERN.test(credential)) {
    return NextResponse.json(
      {
        ok: false,
        message: "La clave encriptada no cumple el formato institucional SAN-MEMBER-XXXXXX.",
      },
      { status: 400 },
    );
  }

  let user = null;

  try {
    if (portal === "member") {
      const memberProfile = await prisma.memberProfile.findFirst({
        where: { username: normalizedUsername },
        include: { user: true },
      });

      user = memberProfile?.user ?? null;
    } else {
      user = await prisma.user.findUnique({ where: { email } });
    }
  } catch {
    const fallbackUser = getDevelopmentFallbackUser({
      portal,
      normalizedUsername,
      email,
      credential,
    });

    if (fallbackUser) {
      return buildLoginResponse(fallbackUser);
    }

    return NextResponse.json(
      {
        ok: false,
        message: "No fue posible validar credenciales en este momento. Verifica DATABASE_URL y reinicia el servidor.",
      },
      { status: 500 },
    );
  }

  if (!user) {
    return NextResponse.json(
      { ok: false, message: "Credenciales inválidas." },
      { status: 401 },
    );
  }

  const isValidPassword = await bcrypt.compare(credential, user.passwordHash);

  if (!isValidPassword) {
    return NextResponse.json(
      { ok: false, message: "Credenciales inválidas." },
      { status: 401 },
    );
  }

  if (portal === "member" && user.role !== "MEMBER") {
    return NextResponse.json(
      {
        ok: false,
        message: "Este usuario no pertenece al acceso de Administrar mis cuentas.",
        redirectTo: "/login",
      },
      { status: 403 },
    );
  }

  if (portal === "account" && user.role === "MEMBER") {
    return NextResponse.json(
      {
        ok: false,
        message: "Este usuario debe ingresar por Administrar mis cuentas. Te redirigimos al portal correcto.",
        redirectTo: "/member-login",
      },
      { status: 403 },
    );
  }

  return buildLoginResponse({
    id: user.id,
    email: user.email,
    nombre: user.nombre,
    role: user.role as Role,
    tokenVersion: user.tokenVersion,
  });
}
