import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, createSessionToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RegisterPayload = {
  nombre?: string;
  apellido?: string;
  email?: string;
  telefono?: string;
  password?: string;
  confirmPassword?: string;
  skipSession?: boolean;
};

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export async function POST(request: Request) {
  const body = (await request.json()) as RegisterPayload;

  const nombre = body.nombre?.trim() ?? "";
  const apellido = body.apellido?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  const telefono = body.telefono?.trim() ?? "";
  const password = body.password ?? "";
  const confirmPassword = body.confirmPassword ?? "";
  const skipSession = body.skipSession === true;

  if (!nombre || !apellido || !email || !telefono || !password || !confirmPassword) {
    return NextResponse.json(
      { ok: false, message: "Completa todos los campos para registrarte." },
      { status: 400 },
    );
  }

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { ok: false, message: "Ingresa un correo electrónico válido." },
      { status: 400 },
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { ok: false, message: "La contraseña debe tener al menos 8 caracteres." },
      { status: 400 },
    );
  }

  if (password !== confirmPassword) {
    return NextResponse.json(
      { ok: false, message: "Las contraseñas no coinciden." },
      { status: 400 },
    );
  }

  const exists = await prisma.user.findUnique({ where: { email } });

  if (exists) {
    return NextResponse.json(
      { ok: false, message: "Ya existe una cuenta registrada con este correo." },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const createdUser = await prisma.user.create({
    data: {
      nombre,
      apellido,
      email,
      telefono,
      passwordHash,
    },
  });

  const response = NextResponse.json({
    ok: true,
    message: "Registro completado. Bienvenido al TEAM SAN.",
  });

  if (skipSession) {
    return response;
  }

  const token = await createSessionToken({
    sub: createdUser.id,
    email: createdUser.email,
    nombre: createdUser.nombre,
    isMember: createdUser.isMember,
  });

  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
