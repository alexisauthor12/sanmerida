import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

function sanitizeCedula(value: string) {
  return value.replace(/[^0-9]/g, "");
}

export async function GET(request: Request) {
  const sessionUser = await getSessionUser();

  if (!sessionUser?.userId) {
    return NextResponse.json({ ok: false, message: "Debes iniciar sesión para consultar expedientes." }, { status: 401 });
  }

  if (sessionUser.isMember) {
    return NextResponse.json({ ok: false, message: "Tu perfil no tiene permisos para consultar expedientes." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const cedula = sanitizeCedula(searchParams.get("cedula") ?? "");

  if (!cedula) {
    return NextResponse.json({ ok: false, message: "Debes indicar la cédula." }, { status: 400 });
  }

  const profile = await prisma.memberProfile.findUnique({
    where: { cedula },
    include: {
      assets: true,
      user: {
        select: {
          id: true,
          nombre: true,
          apellido: true,
          email: true,
          telefono: true,
          isMember: true,
        },
      },
    },
  });

  if (!profile) {
    return NextResponse.json({ ok: true, found: false, message: "No existe expediente para esa cédula." });
  }

  return NextResponse.json({ ok: true, found: true, profile });
}
