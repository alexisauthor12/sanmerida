import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

type Payload = {
  username?: string;
  email?: string;
  nombre?: string;
  apellido?: string;
  telefono?: string;
  cedula?: string;
  memberKey?: string; // plaintext that will be hashed as passwordHash
};

export async function POST(request: Request) {
  // Dev safeguard: only allow in non-production environments
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, message: "No disponible en producción" }, { status: 403 });
  }

  const body = (await request.json()) as Payload;
  const username = (body.username ?? "san-admin").trim().toLowerCase();
  const email = (body.email ?? "san-admin@local").trim().toLowerCase();
  const nombre = body.nombre ?? "SAN";
  const apellido = body.apellido ?? "Admin";
  const telefono = body.telefono ?? "0000000000";
  const cedulaInput = String(body.cedula ?? "").replace(/\D/g, "");
  const memberKey = body.memberKey ?? "SAN-MEMBER-ABC123";

  // Basic format guard similar to login route
  const MEMBER_KEY_PATTERN = /^SAN-MEMBER-[A-Z0-9]{6}$/;
  if (!MEMBER_KEY_PATTERN.test(memberKey)) {
    return NextResponse.json({ ok: false, message: "memberKey inválida. Formato: SAN-MEMBER-XXXXXX" }, { status: 400 });
  }

  try {
    // If a MemberProfile exists, reuse its user if present; else create a new user
    const existingProfile = await prisma.memberProfile.findFirst({ where: { username } });

    let userId = existingProfile?.userId ?? null;

    if (!userId) {
      const passwordHash = await bcrypt.hash(memberKey, 12);
      const user = await prisma.user.upsert({
        where: { email },
        create: {
          nombre,
          apellido,
          email,
          telefono,
          passwordHash,
          isMember: true,
        },
        update: {
          passwordHash,
          isMember: true,
        },
      });
      userId = user.id;
    }

    let cedula = cedulaInput;

    if (!cedula) {
      cedula = `9${Math.floor(Math.random() * 9000000 + 1000000)}`;
    }

    const existingByCedula = await prisma.memberProfile.findUnique({ where: { cedula } });
    if (existingByCedula && existingByCedula.username !== username) {
      cedula = `9${Math.floor(Math.random() * 9000000 + 1000000)}`;
    }

    const profile = await prisma.memberProfile.upsert({
      where: { username },
      update: { userId },
      create: { username, userId, cedula },
    });

    return NextResponse.json({ ok: true, message: "Member admin creado", profile, username, memberKey });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "Error desconocido" }, { status: 500 });
  }
}
