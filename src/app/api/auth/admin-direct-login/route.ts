import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { Client } from "pg";
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { AUTH_COOKIE_NAME, createSessionToken } from "@/lib/auth";
import { getAdminSecurityConfig } from "@/lib/admin-config";

type DirectAdminPayload = {
  username?: string;
  license?: string;
};

type HyperdriveBinding = {
  connectionString?: string;
};

function normalizeEnvValue(value?: string) {
  return value?.trim().replace(/^['"]|['"]$/g, "") ?? "";
}

function resolveDatabase() {
  const isProduction = process.env.NODE_ENV === "production";

  // En Cloudflare (producción) usamos HYPERDRIVE exclusivamente.
  try {
    const { env } = getCloudflareContext();

    const hyperdrive = (env as typeof env & {
      HYPERDRIVE?: HyperdriveBinding;
    }).HYPERDRIVE;

    const connectionString = normalizeEnvValue(
      hyperdrive?.connectionString,
    );

    if (connectionString) {
      console.log(
        "[admin-direct-login] Usando HYPERDRIVE",
      );

      return {
        source: "HYPERDRIVE",
        connectionString,
      };
    }

    if (isProduction) {
      throw new Error("HYPERDRIVE no está disponible en entorno de producción.");
    }
  } catch (error) {
    if (isProduction) {
      throw error;
    }

    console.log(
      "[admin-direct-login] Sin contexto Cloudflare:",
      error instanceof Error ? error.message : String(error),
    );
  }

  // Solo en local permitimos fallback a DATABASE_URL.
  const databaseUrl = normalizeEnvValue(
    process.env.DATABASE_URL,
  );

  if (databaseUrl) {
    console.log(
      "[admin-direct-login] Usando DATABASE_URL",
    );

    return {
      source: "DATABASE_URL",
      connectionString: databaseUrl,
    };
  }

  throw new Error(
    "No existe HYPERDRIVE ni DATABASE_URL.",
  );
}

function getHost(connectionString: string) {
  try {
    return new URL(connectionString).host;
  } catch {
    return "host-desconocido";
  }
}

export async function POST(request: Request) {
  let adminConfig: ReturnType<typeof getAdminSecurityConfig>;

  // ============================================================
  // CONFIGURACION ADMINISTRATIVA
  // ============================================================

  try {
    adminConfig = getAdminSecurityConfig();
  } catch (error) {
    console.error(
      "[admin-direct-login] Error en configuración administrativa:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "Configuración de acceso administrativo incompleta.",
      },
      { status: 500 },
    );
  }

  try {
    // ==========================================================
    // DATOS DEL LOGIN
    // ==========================================================

    const body =
      (await request.json()) as DirectAdminPayload;

    const username = body.username?.trim() ?? "";
    const license = body.license?.trim() ?? "";

    if (!username || !license) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Ingresa usuario admin y licencia.",
        },
        { status: 400 },
      );
    }

    // ==========================================================
    // USUARIO ADMIN
    // ==========================================================

    if (username !== adminConfig.username) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Usuario administrativo inválido.",
        },
        { status: 401 },
      );
    }

    // ==========================================================
    // LICENCIA
    // ==========================================================

    const validLicense =
      adminConfig.licenseConfig.mode === "hash"
        ? await bcrypt.compare(
            license,
            adminConfig.licenseConfig.value,
          )
        : license ===
          adminConfig.licenseConfig.value;

    if (!validLicense) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Licencia administrativa inválida.",
        },
        { status: 401 },
      );
    }

    // ==========================================================
    // BASE DE DATOS
    // ==========================================================

    const database = resolveDatabase();

    const host = getHost(
      database.connectionString,
    );

    console.log(
      "[admin-direct-login] Conectando DB=" +
        database.source +
        ", host=" +
        host,
    );

    const isLocalDatabase =
      /(localhost|127\.0\.0\.1)/.test(
        database.connectionString,
      );

    const client = new Client({
      connectionString:
        database.connectionString,
      ...(isLocalDatabase
        ? {}
        : {
            ssl: {
              rejectUnauthorized: false,
            },
          }),
      connectionTimeoutMillis: 10000,
    });

    try {
      // ========================================================
      // CONECTAR
      // ========================================================

      await client.connect();

      console.log(
        "[admin-direct-login] PostgreSQL conectado correctamente mediante " +
          database.source,
      );

      // ========================================================
      // BUSCAR CUENTA
      // ========================================================

      let accountUser: {
        id: string;
        email: string;
        nombre: string;
      } | null = null;

      const existing =
        await client.query<{
          id: string;
          email: string;
          nombre: string;
        }>(
          'SELECT "id", "email", "nombre" FROM "User" WHERE "email" = $1 LIMIT 1',
          [adminConfig.accountEmail],
        );

      accountUser =
        existing.rows[0] ?? null;

      // ========================================================
      // CREAR CUENTA SI NO EXISTE
      // ========================================================

      if (!accountUser) {
        console.log(
          "[admin-direct-login] Creando cuenta administrativa...",
        );

        const tempPassword =
          "Adm!" +
          Math.random()
            .toString(36)
            .slice(2, 10) +
          "#";

        const passwordHash =
          await bcrypt.hash(
            tempPassword,
            12,
          );

        const createdAt = new Date();
        const createdId = randomUUID();

        const created =
          await client.query<{
            id: string;
            email: string;
            nombre: string;
          }>(
            'INSERT INTO "User" ("id", "nombre", "apellido", "email", "telefono", "passwordHash", "isMember", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING "id", "email", "nombre"',
            [
              createdId,
              "Admin",
              "Root",
              adminConfig.accountEmail,
              "0000000000",
              passwordHash,
              false,
              createdAt,
              createdAt,
            ],
          );

        accountUser =
          created.rows[0] ?? null;
      }

      if (!accountUser) {
        throw new Error(
          "No se pudo obtener ni crear la cuenta administrativa.",
        );
      }

      // ========================================================
      // CREAR TOKEN
      // ========================================================

      const sessionToken =
        await createSessionToken({
          sub: accountUser.id,
          email: accountUser.email,
          nombre: accountUser.nombre,
          isMember: false,
        });

      const response =
        NextResponse.json({
          ok: true,
          message:
            "Sesión administrativa iniciada. Validando licencia...",
          accountEmail:
            accountUser.email,
        });

      // ========================================================
      // COOKIE
      // ========================================================

      response.cookies.set({
        name: AUTH_COOKIE_NAME,
        value: sessionToken,
        httpOnly: true,
        sameSite: "lax",
        secure:
          process.env.NODE_ENV ===
          "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });

      return response;
    } finally {
      await client
        .end()
        .catch(() => undefined);
    }
  } catch (error) {
    console.error(
      "[admin-direct-login] ERROR REAL:",
      error,
    );

    const errorMessage =
      error instanceof Error
        ? error.message
        : String(error);

    return NextResponse.json(
      {
        ok: false,
        message:
          "Error real de base de datos: " +
          errorMessage,
      },
      { status: 500 },
    );
  }
}