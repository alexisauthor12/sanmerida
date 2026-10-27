import { jwtVerify, SignJWT } from "jose";
import { resolveAuthSecret } from "@/lib/secret-helpers.mjs";

export const AUTH_COOKIE_NAME = "san_team_session";
export const ADMIN_ACCESS_COOKIE_NAME = "san_admin_access";

import type { Role } from "@/lib/authz.mjs";

type SessionPayload = {
  sub: string;
  email: string;
  nombre: string;
  /** Rol efectivo. Determina los permisos (ver `authz.mjs`). */
  role: Role;
  /** `User.tokenVersion`: permite revocar la sesion. */
  tokenVersion: number;
};

type AdminAccessPayload = {
  sub: string;
  email: string;
  /** `User.tokenVersion` en el momento de validar la licencia. */
  tokenVersion?: number;
};

/**
 * Secreto de firma de los JWT. **Fail-closed en todos los entornos**: si falta
 * `AUTH_SECRET` la aplicacion no firma sesiones (ver `docs/SEGURIDAD_INTEGRAL.md`,
 * hallazgo C). Ya no existe un secreto de desarrollo por defecto.
 */
const getAuthSecret = () =>
  new TextEncoder().encode(
    resolveAuthSecret(process.env.AUTH_SECRET, {
      warn: (mensaje) => console.warn(`[auth] ${mensaje}`),
    }),
  );

/** Duracion de la sesion segun el rol: los miembros, un poco mas. */
const SESSION_DURATION: Record<Role, string> = {
  PROSPECT: "8h",
  MEMBER: "12h",
  ADMIN: "8h",
};

export async function createSessionToken(payload: SessionPayload) {
  const secret = getAuthSecret();

  return new SignJWT({
    email: payload.email,
    nombre: payload.nombre,
    role: payload.role,
    tv: payload.tokenVersion,
    // Compatibilidad con el codigo que aun lee `isMember` del token.
    isMember: payload.role === "MEMBER",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION[payload.role] ?? "8h")
    .sign(secret);
}

export async function verifySessionToken(token: string) {
  const secret = getAuthSecret();
  const { payload } = await jwtVerify(token, secret);

  return {
    userId: payload.sub,
    email: String(payload.email ?? ""),
    nombre: String(payload.nombre ?? ""),
    role: String(payload.role ?? ""),
    // Un token sin `tv` (emitido antes de esta version) queda en -1 y nunca
    // coincide con la base de datos: se rechaza y se fuerza un nuevo login.
    tokenVersion: Number(payload.tv ?? -1),
    isMember: Boolean(payload.isMember),
  };
}

export async function createAdminAccessToken(payload: AdminAccessPayload) {
  const secret = getAuthSecret();

  return new SignJWT({
    scope: "admin_access",
    email: payload.email,
    tv: payload.tokenVersion ?? -1,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    // La licencia administrativa es un step-up de corta duracion.
    .setExpirationTime("4h")
    .sign(secret);
}

export async function verifyAdminAccessToken(token: string) {
  const secret = getAuthSecret();
  const { payload } = await jwtVerify(token, secret);

  return {
    userId: String(payload.sub ?? ""),
    email: String(payload.email ?? ""),
    scope: String(payload.scope ?? ""),
    tokenVersion: Number(payload.tv ?? -1),
  };
}
