/**
 * Salida de emergencia del segundo factor.
 *
 * Desactiva el TOTP de una cuenta cuando el usuario ha perdido el dispositivo
 * **y** los codigos de recuperacion. Sin esto, un ADMIN quedaria fuera del
 * sistema para siempre. Es una operacion de escritorio: exige acceso a la base
 * de datos, que es justamente el nivel de privilegio que la justifica.
 *
 * Uso:
 *   node scripts/reset-user-totp.mjs --email admin@sanmeridajz.com            (simulacro)
 *   node scripts/reset-user-totp.mjs --email admin@sanmeridajz.com --apply    (aplica)
 *
 * Queda registrado en `AuditLog` como `TOTP_DISABLED` con `metadata.via =
 * "script_cli"`, para que el restablecimiento no sea invisible.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const args = process.argv.slice(2);
const aplicar = args.includes("--apply");
const indiceEmail = args.indexOf("--email");
const email = indiceEmail >= 0 ? (args[indiceEmail + 1] ?? "").trim().toLowerCase() : "";

if (!email) {
  console.error(
    "Falta --email <correo>.\nUso: node scripts/reset-user-totp.mjs --email <correo> [--apply]",
  );
  process.exit(1);
}

const connectionString = (process.env.DATABASE_URL ?? "").trim().replace(/^['"]|['"]$/g, "");

if (!connectionString) {
  console.error("Falta DATABASE_URL.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, maxUses: 1 }) });

try {
  const cuenta = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, totpEnabled: true, totpConfirmedAt: true },
  });

  if (!cuenta) {
    console.error(`No existe ninguna cuenta con el correo ${email}.`);
    process.exitCode = 1;
  } else if (!cuenta.totpEnabled) {
    console.log(`La cuenta ${cuenta.email} (${cuenta.role}) no tiene el segundo factor activo. Nada que hacer.`);
  } else {
    console.log(`Cuenta: ${cuenta.email} (rol ${cuenta.role})`);
    console.log(`Segundo factor activo desde: ${cuenta.totpConfirmedAt?.toISOString() ?? "desconocido"}`);

    if (!aplicar) {
      console.log("\nSIMULACRO: no se ha cambiado nada. Repite con --apply para aplicar el cambio.");
    } else {
      await prisma.user.update({
        where: { id: cuenta.id },
        data: {
          totpEnabled: false,
          totpSecret: null,
          totpConfirmedAt: null,
          // Prisma exige DbNull para dejar un campo JSON en NULL.
          totpRecoveryCodes: { set: null },
          // El contador de fallos tambien se limpia: pudo dispararse al intentar
          // entrar sin el dispositivo.
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });

      await prisma.auditLog.create({
        data: {
          action: "TOTP_DISABLED",
          actorEmail: cuenta.email,
          actorRole: cuenta.role,
          targetType: "User",
          targetId: cuenta.id,
          metadata: { via: "script_cli" },
          success: true,
        },
      });

      console.log(
        "\nHecho. El segundo factor esta desactivado y queda registrado en la auditoria.\n" +
          "Pide al usuario que lo vuelva a activar cuanto antes.",
      );
    }
  }
} catch (error) {
  console.error("Fallo:", error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
