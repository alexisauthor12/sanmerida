/**
 * Purga de la auditoria por retencion (`docs/SEGURIDAD_INTEGRAL.md` 6.4).
 *
 * La tabla `AuditLog` solo crece. Sin esta limpieza, correos, IP y user-agents se
 * conservan indefinidamente: es un problema de minimizacion de datos (y de coste).
 *
 * Dos ventanas, porque no todo se conserva igual:
 *  - **Accesos y cambios** (expedientes, documentos, credenciales, pagos...):
 *    `AUDIT_RETENTION_DAYS` (por defecto **730** dias / 2 anos).
 *  - **Sesion** (login, logout, licencia, 2FA): `AUDIT_RETENTION_DAYS_AUTH`
 *    (por defecto **365** dias / 1 ano).
 *
 * Las filas `AUDIT_PURGE` **nunca** se borran: son el registro de que la limpieza
 * se hizo y de cuanto se elimino.
 *
 * Uso:
 *   node scripts/purge-audit-log.mjs                                  (simulacro)
 *   node scripts/purge-audit-log.mjs --apply
 *   node scripts/purge-audit-log.mjs --dias 365 --apply
 *   node scripts/purge-audit-log.mjs --before 2024-01-01 --apply      (corte explicito)
 *
 * El simulacro es el comportamiento por defecto: nada se borra sin `--apply`.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/** Acciones ligadas a la sesion: se conservan menos tiempo. */
const ACCIONES_DE_SESION = new Set([
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "LOGOUT",
  "SESSION_REVOKED",
  "ADMIN_LICENSE_SUCCESS",
  "ADMIN_LICENSE_FAILED",
  "TOTP_ENABLED",
  "TOTP_DISABLED",
  "TOTP_CHALLENGE_FAILED",
  "RECOVERY_CODE_USED",
]);

const DIAS_POR_DEFECTO = 730;
const DIAS_SESION_POR_DEFECTO = 365;

const args = process.argv.slice(2);

function leerNumero(bandera, porDefecto) {
  const indice = args.indexOf(bandera);

  if (indice < 0) return porDefecto;

  const valor = Number(args[indice + 1]);

  return Number.isFinite(valor) && valor > 0 ? Math.floor(valor) : porDefecto;
}

const aplicar = args.includes("--apply");

function diasDelEntorno(nombre, porDefecto) {
  const valor = Number(process.env[nombre]);

  return Number.isFinite(valor) && valor > 0 ? Math.floor(valor) : porDefecto;
}

const diasGenerales = leerNumero("--dias", diasDelEntorno("AUDIT_RETENTION_DAYS", DIAS_POR_DEFECTO));
const diasSesion = leerNumero(
  "--dias-auth",
  diasDelEntorno("AUDIT_RETENTION_DAYS_AUTH", DIAS_SESION_POR_DEFECTO),
);

const indiceAntes = args.indexOf("--before");
const antesTexto = indiceAntes >= 0 ? String(args[indiceAntes + 1] ?? "") : "";
const antes = antesTexto ? new Date(`${antesTexto}T00:00:00.000Z`) : null;

if (antesTexto && Number.isNaN(antes?.getTime())) {
  console.error(`--before no es una fecha valida: "${antesTexto}". Usa AAAA-MM-DD.`);
  process.exit(1);
}

const connectionString = (process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "")
  .trim()
  .replace(/^['"]|['"]$/g, "");

if (!connectionString) {
  console.error("Falta DATABASE_URL (o DIRECT_URL).");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, maxUses: 1 }) });

/** Fecha de corte: `--before` manda; si no, cada grupo usa su ventana. */
function cortePara(dias) {
  if (antes) return antes;

  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
}

function fecha(iso) {
  return iso.toISOString().slice(0, 10);
}

try {
  const totalAntes = await prisma.auditLog.count();

  const cortes = {
    general: cortePara(diasGenerales),
    sesion: cortePara(diasSesion),
  };

  const accionesDeSesion = [...ACCIONES_DE_SESION];

  // Se cuentan los dos grupos por separado para poder revisar el impacto antes de
  // borrar nada.
  const candidatosGenerales = await prisma.auditLog.count({
    where: {
      createdAt: { lt: cortes.general },
      action: { notIn: [...accionesDeSesion, "AUDIT_PURGE"] },
    },
  });

  const candidatosDeSesion = await prisma.auditLog.count({
    where: { createdAt: { lt: cortes.sesion }, action: { in: accionesDeSesion } },
  });

  console.log(`Registros de auditoria: ${totalAntes}`);
  console.log(`Corte general (${diasGenerales} dias): ${fecha(cortes.general)} -> ${candidatosGenerales} candidatos`);
  console.log(`Corte de sesion (${diasSesion} dias): ${fecha(cortes.sesion)} -> ${candidatosDeSesion} candidatos`);
  console.log("Las filas AUDIT_PURGE nunca se borran.");

  if (antes) {
    console.log(`(--before ${antesTexto}: el corte explicito se aplica a los dos grupos)`);
  }

  const total = candidatosGenerales + candidatosDeSesion;

  if (total === 0) {
    console.log("\nNo hay nada que purgar. Nada que hacer.");
  } else if (!aplicar) {
    console.log(`\nSIMULACRO: se borrarian ${total} registro(s). Repite con --apply para aplicar.`);
  } else {
    const borradosGenerales = await prisma.auditLog.deleteMany({
      where: {
        createdAt: { lt: cortes.general },
        action: { notIn: [...accionesDeSesion, "AUDIT_PURGE"] },
      },
    });

    const borradosDeSesion = await prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cortes.sesion }, action: { in: accionesDeSesion } },
    });

    const borrados = borradosGenerales.count + borradosDeSesion.count;

    // Resumen permanente: la propia purga queda auditada y estas filas se excluyen
    // del borrado, de modo que siempre se puede reconstruir que se limpio y cuando.
    await prisma.auditLog.create({
      data: {
        action: "AUDIT_PURGE",
        actorRole: "SYSTEM",
        targetType: "AuditLog",
        metadata: {
          borrados,
          generales: borradosGenerales.count,
          sesion: borradosDeSesion.count,
          corteGeneral: fecha(cortes.general),
          corteSesion: fecha(cortes.sesion),
          restantes: totalAntes - borrados,
        },
        success: true,
      },
    });

    console.log(`\nPurga aplicada: ${borrados} registro(s) eliminado(s).`);
    console.log("Se ha registrado el resumen en auditoria (AUDIT_PURGE).");
  }
} catch (error) {
  console.error("Fallo:", error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
