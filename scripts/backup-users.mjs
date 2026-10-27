/**
 * Respaldo de la tabla `User` antes de aplicar un cambio de esquema.
 *
 * Escribe `backups/users-<fecha>.json` (carpeta ignorada por Git) con TODAS las
 * filas de `User`, para poder restaurarlas si algo sale mal.
 *
 * Uso:
 *   node scripts/backup-users.mjs
 *
 * Nota: incluye `passwordHash` porque es un respaldo de restauracion; los hashes
 * bcrypt no son reversibles. El archivo NO se versiona.
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function clean(value) {
  return value?.trim().replace(/^['"]|['"]$/g, "") ?? "";
}

const connectionString = clean(process.env.DATABASE_URL);

if (!connectionString) {
  console.error("Falta DATABASE_URL.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, maxUses: 1 }) });

try {
  // Se piden las columnas una por una: asi el respaldo funciona tanto antes como
  // despues de aplicar la migracion de roles.
  const usuarios = await prisma.user.findMany({
    select: {
      id: true,
      nombre: true,
      apellido: true,
      email: true,
      telefono: true,
      passwordHash: true,
      isMember: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const destino = path.resolve(process.cwd(), "backups");
  await mkdir(destino, { recursive: true });

  const marca = new Date().toISOString().replace(/[:.]/g, "-");
  const archivo = path.join(destino, `users-${marca}.json`);

  await writeFile(
    archivo,
    JSON.stringify({ generadoEn: new Date().toISOString(), total: usuarios.length, usuarios }, null, 2),
    "utf8",
  );

  console.log(`Respaldo creado: backups/users-${marca}.json`);
  console.log(`Filas respaldadas: ${usuarios.length}`);
} catch (error) {
  console.error("No se pudo respaldar la tabla User.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect().catch(() => undefined);
}
