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

/**
 * Blindaje fail-closed: la ruta SOLO existe en desarrollo.
 *
 * Antes se comprobaba `NODE_ENV === "production"` (fail-open): un despliegue con
 * `NODE_ENV` sin definir dejaba este endpoint abierto y permitia crear cuentas
 * de miembro con credenciales conocidas. Ahora solo se habilita cuando
 * `NODE_ENV === "development"` y en cualquier otro caso responde 404, como si la
 * ruta no existiera (no revela que existe).
 */
function isDevRouteEnabled() {
  return process.env.NODE_ENV === "development";
}

export async function POST(request: Request) {
  if (!isDevRouteEnabled()) {
    return NextResponse.json({ ok: false, message: "Recurso no encontrado." }, { status: 404 });
  }

  let body: Payload;

  try {
    body = (await request.json()) as Payload;
  } catch {
    return NextResponse.json({ ok: false, message: "Cuerpo de la solicitud inválido." }, { status: 400 });
  }

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

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, message: "Correo inválido." }, { status: 400 });
  }

  try {
    // If a MemberProfile exists, reuse its user if present; else create a new user
    const existingProfile = await prisma.memberProfile.findFirst({ where: { username } });

    let userId = existingProfile?.userId ?? null;

    if (!userId) {
      // Blindaje: si el correo ya pertenece a una cuenta que NO es de miembro
      // (por ejemplo una cuenta del equipo), se rechaza en vez de convertirla en
      // miembro y sobrescribir su contraseña.
      const existingUser = await prisma.user.findUnique({
        where: { email },
        select: { isMember: true },
      });

      if (existingUser && !existingUser.isMember) {
        return NextResponse.json(
          {
            ok: false,
            message: `El correo ${email} pertenece a una cuenta del equipo. Usa otro correo para la cuenta de prueba.`,
          },
          { status: 409 },
        );
      }

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
