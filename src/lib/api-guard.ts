import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ADMIN_ACCESS_COOKIE_NAME,
  AUTH_COOKIE_NAME,
  verifyAdminAccessToken,
  verifySessionToken,
} from "@/lib/auth";
import { can, requiresStepUp } from "@/lib/authz.mjs";
import type { Permission, Role } from "@/lib/authz.mjs";
import { labelExpediente, recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

/**
 * Puerta unica de autorizacion (`docs/SEGURIDAD_INTEGRAL.md` seccion 5).
 *
 * Regla de oro: **todo endpoint nace cerrado**. Cada `route.ts` empieza llamando a
 * `requirePermission()` o `requireSession()`, o figura en `PUBLIC_ROUTES`. Esto se
 * verifica automaticamente con `tests/api-guard-coverage.test.mjs`.
 *
 * El guard comprueba, en este orden:
 *  1. Firma del JWT (fail-closed si falta `AUTH_SECRET`).
 *  2. `tokenVersion` vigente y cuenta no bloqueada.
 *  3. Permiso del rol (`authz.mjs`).
 *  4. Licencia administrativa, si el permiso exige step-up.
 *  5. Auditoria del acceso (concedido o denegado).
 */

/**
 * Rutas publicas: lista blanca explicita y auditada.
 *
 * - `/api/auth/login`: puerta de entrada.
 * - `/api/auth/logout`: solo borra cookies.
 * - `/api/auth/register`: registro inicial publico; la cuenta nace como PROSPECT
 *   y no obtiene ningun permiso sobre datos de terceros.
 * - `/api/dev/create-member-admin`: utilidad de desarrollo, responde 404 en
 *   cualquier entorno que no sea `development`.
 * - `/api/csp-report`: los navegadores envian los informes de CSP **sin
 *   credenciales**, asi que exigir sesion los descartaria todos. A cambio solo
 *   acepta POST, responde siempre `204`, acota el cuerpo, filtra los campos a una
 *   lista cerrada y tiene rate limiting por IP (ver
 *   `src/app/api/csp-report/route.ts`).
 */
export const PUBLIC_ROUTES = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/register",
  "/api/dev/create-member-admin",
  "/api/csp-report",
];

export type SessionUser = {
  userId: string;
  email: string;
  nombre: string;
  role: Role;
  tokenVersion: number;
  /**
   * Epoch ms en que esta sesion demostro el segundo factor, o 0 si no consta.
   *
   * Lo usa el step-up de la licencia para no pedir el mismo codigo que el login acaba
   * de verificar (ver `segundoFactorReciente` en `totp.mjs`).
   */
  totpAt: number;
};

export type GuardResult =
  | { ok: true; user: SessionUser; licenseValidated: boolean }
  | { ok: false; response: NextResponse };

const UNAUTHORIZED = "Tu sesión no es válida. Inicia sesión de nuevo.";
const FORBIDDEN = "Tu perfil no tiene permisos para esta acción.";

function denied(status: number, message: string) {
  return NextResponse.json({ ok: false, message }, { status });
}

/**
 * Respuesta uniforme 404. Se usa cuando el usuario no puede acceder a un recurso
 * ajeno: no confirma si existe (evita la enumeracion de cedulas).
 */
export function notFound(message = "No encontramos lo que buscas.") {
  return NextResponse.json({ ok: false, message }, { status: 404 });
}

/** True si la licencia administrativa esta validada y ligada a esta sesion. */
async function hasValidLicense(userId: string, tokenVersion: number) {
  const token = (await cookies()).get(ADMIN_ACCESS_COOKIE_NAME)?.value;

  if (!token) return false;

  try {
    const payload = await verifyAdminAccessToken(token);

    return (
      payload.scope === "admin_access" &&
      payload.userId === userId &&
      payload.tokenVersion === tokenVersion
    );
  } catch {
    return false;
  }
}

/**
 * Sesion valida: firma correcta, `tokenVersion` vigente y cuenta no bloqueada.
 * Fail-closed: cualquier duda deniega.
 */
export async function requireSession(): Promise<GuardResult> {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return { ok: false, response: denied(401, UNAUTHORIZED) };
  }

  let payload: Awaited<ReturnType<typeof verifySessionToken>>;

  try {
    payload = await verifySessionToken(token);
  } catch {
    return { ok: false, response: denied(401, UNAUTHORIZED) };
  }

  const userId = String(payload.userId ?? "");

  if (!userId) {
    return { ok: false, response: denied(401, UNAUTHORIZED) };
  }

  const cuenta = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      nombre: true,
      role: true,
      tokenVersion: true,
      lockedUntil: true,
    },
  });

  if (!cuenta || payload.tokenVersion !== cuenta.tokenVersion) {
    return { ok: false, response: denied(401, UNAUTHORIZED) };
  }

  if (cuenta.lockedUntil && cuenta.lockedUntil.getTime() > Date.now()) {
    return { ok: false, response: denied(403, "Tu cuenta está bloqueada temporalmente.") };
  }

  return {
    ok: true,
    user: {
      userId: cuenta.id,
      email: cuenta.email,
      nombre: cuenta.nombre,
      role: cuenta.role as Role,
      tokenVersion: cuenta.tokenVersion,
      // Viene firmado en el token: se emitio cuando el segundo factor se verifico.
      totpAt: payload.totpAt ?? 0,
    },
    licenseValidated: await hasValidLicense(cuenta.id, cuenta.tokenVersion),
  };
}

/** Deja constancia de un acceso denegado (la senal de alerta mas util). */
async function registrarDenegacion(
  user: SessionUser,
  permission: Permission,
  motivo: "permiso" | "licencia" | "propietario",
  request?: Request,
  extra?: { targetType?: string; targetId?: string; targetLabel?: string },
) {
  await recordAudit({
    action: "ACCESS_DENIED",
    actor: { userId: user.userId, email: user.email, role: user.role },
    metadata: { permiso: permission, motivo },
    targetType: extra?.targetType,
    targetId: extra?.targetId,
    targetLabel: extra?.targetLabel,
    success: false,
    request,
  });
}

/**
 * Sesion valida + permiso concedido. Es la funcion que deben usar las rutas.
 *
 * @param permission permiso requerido del catalogo (`authz.mjs`).
 * @param options.request peticion original, para registrar IP y user-agent.
 */
export async function requirePermission(
  permission: Permission,
  options: { request?: Request } = {},
): Promise<GuardResult> {
  const session = await requireSession();

  if (!session.ok) return session;

  const { user, licenseValidated } = session;

  if (!can(user.role, permission)) {
    await registrarDenegacion(user, permission, "permiso", options.request);

    return { ok: false, response: denied(403, FORBIDDEN) };
  }

  if (requiresStepUp(permission) && !licenseValidated) {
    await registrarDenegacion(user, permission, "licencia", options.request);

    return {
      ok: false,
      response: denied(403, "Valida la licencia administrativa para esta acción."),
    };
  }

  return { ok: true, user, licenseValidated };
}

/**
 * True si el expediente pertenece al usuario de la sesion.
 * El acceso `own` SIEMPRE se resuelve por `userId`: **nunca** por la cedula que
 * llega en la peticion.
 */
export async function isOwnProfile(userId: string, cedula: string): Promise<boolean> {
  const profile = await prisma.memberProfile.findUnique({
    where: { cedula },
    select: { userId: true },
  });

  return Boolean(profile?.userId && profile.userId === userId);
}

/**
 * Autoriza el acceso a un expediente concreto:
 *  - ADMIN (o quien tenga el permiso `:any`): cualquiera.
 *  - MEMBER: unicamente el suyo.
 *
 * Si no se autoriza responde **404 uniforme** (no 403) para no confirmar la
 * existencia del expediente. Este es el control que cierra la fuga de
 * `/api/member-files/*` (hallazgo B).
 */
export async function requireExpedienteAccess(
  cedula: string,
  options: {
    request?: Request;
    /** Permiso de acceso a cualquier expediente. Por defecto, el de lectura. */
    anyPermission?: Permission;
    /** Permiso de acceso al expediente propio. Por defecto, el de lectura. */
    ownPermission?: Permission;
  } = {},
): Promise<GuardResult> {
  const anyPermission = options.anyPermission ?? "expediente:read:any";
  const ownPermission = options.ownPermission ?? "expediente:read:own";

  const session = await requireSession();

  if (!session.ok) return session;

  const { user, licenseValidated } = session;

  if (can(user.role, anyPermission)) {
    return { ok: true, user, licenseValidated };
  }

  if (can(user.role, ownPermission) && (await isOwnProfile(user.userId, cedula))) {
    return { ok: true, user, licenseValidated };
  }

  await registrarDenegacion(user, ownPermission, "propietario", options.request, {
    targetType: "MemberProfile",
    targetLabel: labelExpediente(cedula),
  });

  return { ok: false, response: notFound() };
}
