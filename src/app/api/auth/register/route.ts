import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, createSessionToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";

type RegisterPayload = {
  nombre?: string;
  apellido?: string;
  email?: string;
  telefono?: string;
  password?: string;
  confirmPassword?: string;
  skipSession?: boolean;
};

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export async function POST(request: Request) {
  const body = (await request.json()) as RegisterPayload;

  const nombre = body.nombre?.trim() ?? "";
  const apellido = body.apellido?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  const telefono = body.telefono?.trim() ?? "";
  const password = body.password ?? "";
  const confirmPassword = body.confirmPassword ?? "";
  const skipSession = body.skipSession === true;

  if (
    !nombre ||
    !apellido ||
    !email ||
    !telefono ||
    !password ||
    !confirmPassword
  ) {
    return NextResponse.json(
      {
        ok: false,
        message: "Completa todos los campos para registrarte.",
      },
      { status: 400 },
    );
  }

  if (!isValidEmail(email)) {
    return NextResponse.json(
      {
        ok: false,
        message: "Ingresa un correo electrónico válido.",
      },
      { status: 400 },
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      {
        ok: false,
        message: "La contraseña debe tener al menos 8 caracteres.",
      },
      { status: 400 },
    );
  }

  if (password !== confirmPassword) {
    return NextResponse.json(
      {
        ok: false,
        message: "Las contraseñas no coinciden.",
      },
      { status: 400 },
    );
  }

  // Registro publico: limite por IP para frenar la creacion masiva de cuentas.
  const limite = await checkRateLimit("register", { request });

  if (!limite.allowed) {
    return tooManyRequests(limite.retryAfterSeconds);
  }

  try {
    const existente = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existente) {
      return NextResponse.json(
        {
          ok: false,
          message: "Ya existe una cuenta registrada con este correo.",
        },
        { status: 409 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // El registro publico nace como PROSPECT: accede al dashboard de catalogo,
    // feed y novedades, y NO tiene ningun permiso sobre expedientes, documentos
    // ni cuotas de terceros (ver docs/SEGURIDAD_INTEGRAL.md 13.1).
    const creado = await prisma.user.create({
      data: {
        nombre,
        apellido,
        email,
        telefono,
        passwordHash,
        role: "PROSPECT",
        isMember: false,
        passwordChangedAt: new Date(),
      },
      select: { id: true, email: true, nombre: true, role: true, tokenVersion: true },
    });

    const response = NextResponse.json({
      ok: true,
      message: "Registro completado. Ya puedes explorar el catálogo y las novedades.",
      role: creado.role,
    });

    if (!skipSession) {
      const token = await createSessionToken({
        sub: creado.id,
        email: creado.email,
        nombre: creado.nombre,
        role: "PROSPECT",
        tokenVersion: creado.tokenVersion,
      });

      response.cookies.set({
        name: AUTH_COOKIE_NAME,
        value: token,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 8,
      });
    }

    return response;
  } catch (error) {
    // El detalle queda solo en el log del servidor: nunca en la respuesta.
    console.error("[REGISTER] No se pudo crear la cuenta:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "No se pudo completar el registro. Intenta de nuevo en unos minutos.",
      },
      { status: 500 },
    );
  }
}