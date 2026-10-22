import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function clean(value?: string) {
  return value?.trim().replace(/^['"]|['"]$/g, "") ?? "";
}

function getHyperdriveUrl() {
  try {
    const { env } = getCloudflareContext();

    const hyperdrive = (env as typeof env & {
      HYPERDRIVE?: {
        connectionString?: string;
      };
    }).HYPERDRIVE;

    return clean(hyperdrive?.connectionString);
  } catch {
    return "";
  }
}

function getDatabaseUrl() {
  // En Cloudflare (produccion) priorizamos HYPERDRIVE, que es el pool de
  // conexiones oficial hacia Supabase/Postgres. En local no existe el binding
  // y getHyperdriveUrl() devuelve "", por lo que se cae a DATABASE_URL.
  const hyperdriveUrl = getHyperdriveUrl();

  if (hyperdriveUrl) {
    return hyperdriveUrl;
  }

  const databaseUrl = clean(process.env.DATABASE_URL);

  if (databaseUrl) {
    return databaseUrl;
  }

  const candidates = [
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.SUPABASE_DB_URL,
  ];

  for (const candidate of candidates) {
    const url = clean(candidate);

    if (url) {
      return url;
    }
  }

  throw new Error(
    "DATABASE_URL/HYPERDRIVE no está configurado."
  );
}

function createPrismaClient() {
  const connectionString = getDatabaseUrl();

  console.log(
    "[Prisma] PostgreSQL configurado:",
    connectionString.replace(
      /:\/\/([^:]+):([^@]+)@/,
      "://$1:***@"
    )
  );

  const adapter = new PrismaPg({
    connectionString,
    maxUses: 1,
  });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });
}

export function getPrisma() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }

  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrisma();
    const value = Reflect.get(client as object, prop, receiver);

    return typeof value === "function"
      ? value.bind(client)
      : value;
  },
}) as PrismaClient;