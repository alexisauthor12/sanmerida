import { jwtVerify, SignJWT } from "jose";

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

const getAuthSecret = () => {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV !== "production") {
      return new TextEncoder().encode("san-local-dev-auth-secret");
    }
    throw new Error("AUTH_SECRET no está configurado.");
  }
  return new TextEncoder().encode(secret);
};

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
