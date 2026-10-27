import { jwtVerify, SignJWT } from "jose";
import { resolveAuthSecret } from "@/lib/secret-helpers.mjs";

export const AUTH_COOKIE_NAME = "san_team_session";
export const ADMIN_ACCESS_COOKIE_NAME = "san_admin_access";

type SessionPayload = {
  sub: string;
  email: string;
  nombre: string;
  isMember: boolean;
};

type AdminAccessPayload = {
  sub: string;
  email: string;
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

export async function createSessionToken(payload: SessionPayload) {
  const secret = getAuthSecret();

  return new SignJWT({
    email: payload.email,
    nombre: payload.nombre,
    isMember: payload.isMember,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifySessionToken(token: string) {
  const secret = getAuthSecret();
  const { payload } = await jwtVerify(token, secret);

  return {
    userId: payload.sub,
    email: String(payload.email ?? ""),
    nombre: String(payload.nombre ?? ""),
    isMember: Boolean(payload.isMember),
  };
}

export async function createAdminAccessToken(payload: AdminAccessPayload) {
  const secret = getAuthSecret();

  return new SignJWT({
    scope: "admin_access",
    email: payload.email,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);
}

export async function verifyAdminAccessToken(token: string) {
  const secret = getAuthSecret();
  const { payload } = await jwtVerify(token, secret);

  return {
    userId: String(payload.sub ?? ""),
    email: String(payload.email ?? ""),
    scope: String(payload.scope ?? ""),
  };
}
