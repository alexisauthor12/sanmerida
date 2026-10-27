/**
 * Backfill de roles y campos de seguridad en `User`.
 *
 * Se ejecuta UNA VEZ, inmediatamente despues de aplicar el esquema nuevo, para
 * que NADIE pierda acceso:
 *
 *   - cuentas de miembro (isMember = true)  -> MEMBER
 *   - cuentas de equipo  (isMember = false) -> ADMIN
 *
 * Es **idempotente**: si ya se ejecuto, no cambia nada.
 *
 * Uso:
 *   node scripts/backfill-user-roles.mjs            (simulacion: no escribe)
 *   node scripts/backfill-user-roles.mjs --apply    (aplica los cambios)
 *
 * O en un solo paso, junto con el esquema:
 *   npm run db:security:migrate
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const apply = process.argv.includes("--apply");

function clean(value) {
  return value?.trim().replace(/^['"]|['"]$/g, "") ?? "";
}

function host(connectionString) {
  try {
    return new URL(connectionString).host;
  } catch {
    return "host-desconocido";
  }
}

const connectionString = clean(process.env.DATABASE_URL);

if (!connectionString) {
  console.error("Falta DATABASE_URL. Define la conexion antes de ejecutar este script.");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString, maxUses: 1 }),
});

try {
  console.log(`Destino: ${host(connectionString)}`);
  console.log(apply ? "Modo: APLICAR\n" : "Modo: SIMULACION (usa --apply para escribir)\n");

  const total = await prisma.user.count();

  const pendientesMiembro = await prisma.user.count({
    where: { isMember: true, role: { not: "MEMBER" } },
  });

  const pendientesEquipo = await prisma.user.count({
    where: { isMember: false, role: { not: "ADMIN" } },
  });

  console.log(`Cuentas totales:              ${total}`);
  console.log(`Pendientes de pasar a MEMBER: ${pendientesMiembro}`);
  console.log(`Pendientes de pasar a ADMIN:  ${pendientesEquipo}`);

  if (apply && (pendientesMiembro > 0 || pendientesEquipo > 0)) {
    const aMiembro = await prisma.user.updateMany({
      where: { isMember: true, role: { not: "MEMBER" } },
      data: { role: "MEMBER" },
    });

    const aAdmin = await prisma.user.updateMany({
      where: { isMember: false, role: { not: "ADMIN" } },
      data: { role: "ADMIN" },
    });

    console.log(`\nActualizadas a MEMBER: ${aMiembro.count}`);
    console.log(`Actualizadas a ADMIN:  ${aAdmin.count}`);
  }

  if (apply) {
    const fechas = await prisma.$executeRawUnsafe(
      'UPDATE "User" SET "passwordChangedAt" = "updatedAt" WHERE "passwordChangedAt" IS NULL',
    );

    console.log(`passwordChangedAt inicializado en ${fechas} cuenta(s).`);
  }

  const porRol = await prisma.user.groupBy({ by: ["role"], _count: { _all: true } });

  console.log("\nEstado por rol:");

  for (const fila of porRol) {
    console.log(`  ${String(fila.role).padEnd(9)} ${fila._count._all}`);
  }

  if (!apply) {
    console.log("\nSimulacion: no se escribio nada. Ejecuta con --apply para aplicar.");
  }
} catch (error) {
  console.error("\nNo se pudo completar el backfill.");
  console.error(error instanceof Error ? error.message : String(error));
  console.error(
    '\nSi el error menciona la columna "role", aplica primero el esquema: npm run db:push',
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect().catch(() => undefined);
}
