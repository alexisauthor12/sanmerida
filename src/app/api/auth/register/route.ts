import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { Client } from "pg";
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { AUTH_COOKIE_NAME, createSessionToken } from "@/lib/auth";

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

function clean(value?: string) {
  return value?.trim().replace(/^['"]|['"]$/g, "") ?? "";
}

function getDatabaseUrl(): string {
  // Cloudflare Worker / Hyperdrive
  try {
    const { env } = getCloudflareContext();
    const hyperdrive = (env as typeof env & {
      HYPERDRIVE?: { connectionString?: string };
    }).HYPERDRIVE;

    if (hyperdrive?.connectionString) {
      return clean(hyperdrive.connectionString);
    }
  } catch {
    // En Next.js local puede no existir el contexto de Cloudflare.
  }

  // Desarrollo local
  const localUrl = clean(process.env.DATABASE_URL);

  if (localUrl) {
    return localUrl;
  }

  throw new Error(
    "No existe una conexión PostgreSQL disponible. Falta HYPERDRIVE o DATABASE_URL.",
  );
}

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

  let client: Client | null = null;

  try {
    const connectionString = getDatabaseUrl();

    console.log(
      "[REGISTER] Conectando a PostgreSQL mediante",
      connectionString.includes("pooler.supabase.com")
        ? "Supabase/Hyperdrive"
        : "DATABASE_URL",
    );

    const isLocalDatabase =
      /(localhost|127\.0\.0\.1)/.test(
        connectionString,
      );

    client = new Client({
      connectionString,
      ...(isLocalDatabase
        ? {}
        : {
            ssl: {
              rejectUnauthorized: false,
            },
          }),
    });

    await client.connect();

    console.log("[REGISTER] PostgreSQL conectado correctamente.");

    const exists = await client.query<{ id: string }>(
      'SELECT "id" FROM "User" WHERE "email" = $1 LIMIT 1',
      [email],
    );

    if (exists.rows[0]) {
      return NextResponse.json(
        {
          ok: false,
          message: "Ya existe una cuenta registrada con este correo.",
        },
        { status: 409 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const createdAt = new Date();
    const createdId = randomUUID();

    const created = await client.query<{
      id: string;
      email: string;
      nombre: string;
      role: string;
      tokenVersion: number;
    }>(
      `INSERT INTO "User"
        ("id", "nombre", "apellido", "email", "telefono",
         "passwordHash", "role", "isMember", "createdAt", "updatedAt")
       VALUES
        ($1, $2, $3, $4, $5, $6, $7::"UserRole", $8, $9, $10)
       RETURNING "id", "email", "nombre", "role", "tokenVersion"`,
      [
        createdId,
        nombre,
        apellido,
        email,
        telefono,
        passwordHash,
        // El registro publico es un PROSPECT: accede al dashboard de catalogo,
        // feed y novedades, pero NUNCA a expedientes, documentos ni cuotas de
        // terceros (ver docs/SEGURIDAD_INTEGRAL.md 13.1).
        "PROSPECT",
        false,
        createdAt,
        createdAt,
      ],
    );

    const row = created.rows[0];

    if (!row) {
      throw new Error("PostgreSQL no devolvió el usuario creado.");
    }

    const response = NextResponse.json({
      ok: true,
      message: "Registro completado. Ya puedes explorar el catálogo y las novedades.",
      role: "PROSPECT",
    });

    if (!skipSession) {
      const token = await createSessionToken({
        sub: row.id,
        email: row.email,
        nombre: row.nombre,
        role: "PROSPECT",
        tokenVersion: row.tokenVersion,
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
  } finally {
    if (client) {
      try {
        await client.end();
      } catch {
        // Ignorar error de cierre.
      }
    }
  }
}