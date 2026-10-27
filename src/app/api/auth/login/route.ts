import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { createSessionToken, AUTH_COOKIE_NAME } from "@/lib/auth";
import type { Role } from "@/lib/authz.mjs";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { extractClientIp } from "@/lib/request-info.mjs";
import { normalizeMemberUsername } from "@/lib/security-helpers.mjs";
import { checkSecondFactor, SECOND_FACTOR_MESSAGE } from "@/lib/totp-service";

type LoginPayload = {
  username?: string;
  email?: string;
  password?: string;
  encryptedKey?: string;
  /** Codigo del segundo factor: de la app autenticadora o de recuperacion. */
  totpCode?: string;
  portal?: "account" | "member";
};

const MEMBER_KEY_PATTERN = /^SAN-MEMBER-[A-Z0-9]{6}$/;

/**
 * Mensaje unico de fallo. No distingue entre contrasena incorrecta, cuenta
 * inexistente, cuenta bloqueada ni codigo de verificacion erroneo: el error no
 * puede servir para enumerar cuentas.
 */
const CREDENCIALES_INVALIDAS = "Credenciales inválidas.";

/**
 * Escalones del bloqueo progresivo (`docs/SEGURIDAD_INTEGRAL.md` 10.3).
 * El orden importa: se busca de mayor a menor.
 */
const ESCALONES_BLOQUEO = [
  { intentos: 20, minutos: 24 * 60 },
  { intentos: 10, minutos: 60 },
  { intentos: 5, minutos: 15 },
];

/** Campos de la cuenta que necesitan las rutinas de acceso. */
type CuentaDeAcceso = {
  id: string;
  email: string;
  role: string;
  failedLoginCount: number;
};

/** Momento hasta el que hay que bloquear la cuenta, o null si no toca bloquear. */
function calcularBloqueo(intentosFallidos: number): Date | null {
  const escalon = ESCALONES_BLOQUEO.find((item) => intentosFallidos >= item.intentos);

  return escalon ? new Date(Date.now() + escalon.minutos * 60 * 1000) : null;
}

/**
 * Suma un intento fallido y aplica el bloqueo progresivo.
 *
 * Si la actualizacion falla no se interrumpe la respuesta: el usuario recibe su
 * 401 igual (best-effort, como la auditoria). Lo que nunca se hace es dejar pasar
 * el acceso.
 */
async function registrarIntentoFallido(
  user: CuentaDeAcceso,
  request: Request,
  portal: string,
  motivo = "credenciales",
) {
  const intentos = user.failedLoginCount + 1;
  const lockedUntil = calcularBloqueo(intentos);

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: intentos, lockedUntil },
    });
  } catch (error) {
    console.error("[login] No se pudo actualizar el contador de fallos", error);
  }

  await recordAudit({
    action: "LOGIN_FAILED",
    actor: { userId: user.id, email: user.email, role: user.role },
    targetType: "User",
    targetId: user.id,
    metadata: { portal, motivo, intentos, bloqueado: Boolean(lockedUntil) },
    success: false,
    request,
  });
}

/** Acceso correcto: limpia el contador de fallos y traza el inicio de sesion. */
async function registrarAccesoCorrecto(user: CuentaDeAcceso, request: Request, portal: string) {
  const ip = extractClientIp((nombre) => request.headers.get(nombre)) || null;

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ip,
      },
    });
  } catch (error) {
    console.error("[login] No se pudo registrar el ultimo acceso", error);
  }

  await recordAudit({
    action: "LOGIN_SUCCESS",
    actor: { userId: user.id, email: user.email, role: user.role },
    targetType: "User",
    targetId: user.id,
    metadata: { portal },
    request,
  });
}

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
    // Cuenta inexistente: no se audita por cuenta. Seria un vertedero de escrituras
    // con correos al azar; el rate limiting ya deja su propia traza.
    return NextResponse.json({ ok: false, message: CREDENCIALES_INVALIDAS }, { status: 401 });
  }

  // Bloqueo progresivo (docs 10.3). Se comprueba antes de la contrasena para no
  // gastar bcrypt en una cuenta bloqueada, y con el mismo mensaje generico: no se
  // revela que la cuenta existe ni que esta bloqueada.
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await recordAudit({
      action: "LOGIN_FAILED",
      actor: { userId: user.id, email: user.email, role: user.role },
      targetType: "User",
      targetId: user.id,
      metadata: {
        portal,
        motivo: "cuenta_bloqueada",
        bloqueadoHasta: user.lockedUntil.toISOString(),
      },
      success: false,
      request,
    });

    return NextResponse.json({ ok: false, message: CREDENCIALES_INVALIDAS }, { status: 401 });
  }

  const isValidPassword = await bcrypt.compare(credential, user.passwordHash);

  if (!isValidPassword) {
    await registrarIntentoFallido(user, request, portal);

    return NextResponse.json({ ok: false, message: CREDENCIALES_INVALIDAS }, { status: 401 });
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

  // Segundo factor: si la cuenta lo tiene activo, la contrasena sola no basta.
  const factor = await checkSecondFactor(user, body.totpCode);

  if (!factor.ok) {
    await registrarIntentoFallido(
      user,
      request,
      portal,
      factor.reason === "missing" ? "segundo_factor_ausente" : "segundo_factor_invalido",
    );

    return NextResponse.json(
      {
        ok: false,
        // La interfaz usa esta marca para pedir el codigo y reintentar.
        requiresTotp: true,
        message:
          factor.reason === "missing"
            ? "Ingresa el código de 6 dígitos de tu app autenticadora."
            : SECOND_FACTOR_MESSAGE,
      },
      { status: 401 },
    );
  }

  if (factor.viaRecovery) {
    await recordAudit({
      action: "RECOVERY_CODE_USED",
      actor: { userId: user.id, email: user.email, role: user.role },
      targetType: "User",
      targetId: user.id,
      metadata: { portal },
      request,
    });
  }

  await registrarAccesoCorrecto(user, request, portal);

  return buildLoginResponse({
    id: user.id,
    email: user.email,
    nombre: user.nombre,
    role: user.role as Role,
    tokenVersion: user.tokenVersion,
  });
}
