/**
 * Resumen de los informes de violacion de CSP (`docs/SEGURIDAD_INTEGRAL.md` 9.1).
 *
 * La politica estricta viaja en **modo informe**: el navegador manda lo que habria
 * bloqueado sin bloquearlo. Este script agrega esos informes para poder decidir si
 * ya se puede activar la politica sin `unsafe-inline`.
 *
 * Uso:
 *   node scripts/csp-report-summary.mjs                 (ultimos 7 dias)
 *   node scripts/csp-report-summary.mjs --dias 30
 *   node scripts/csp-report-summary.mjs --dias 30 --limpiar   (borra lo analizado)
 *
 * Criterio de lectura: si en la ventana analizada **no aparece** `inline` en
 * `script-src` ni en `style-src`, la politica estricta se puede activar.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const args = process.argv.slice(2);
const indiceDias = args.indexOf("--dias");
const dias = indiceDias >= 0 ? Math.max(1, Number(args[indiceDias + 1]) || 7) : 7;
const limpiar = args.includes("--limpiar");

const connectionString = (process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "")
  .trim()
  .replace(/^['"]|['"]$/g, "");

if (!connectionString) {
  console.error("Falta DATABASE_URL (o DIRECT_URL).");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, maxUses: 1 }) });

function tabla(titulo, mapa) {
  const filas = [...mapa.entries()].sort((uno, otro) => otro[1] - uno[1]).slice(0, 10);

  if (filas.length === 0) return;

  console.log(`\n${titulo}`);
  for (const [valor, total] of filas) {
    console.log(`  ${String(total).padStart(6)}  ${valor}`);
  }
}

try {
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

  const informes = await prisma.cspViolation.findMany({
    where: { createdAt: { gte: desde } },
    select: { directive: true, blockedUri: true, documentUri: true, disposition: true },
    take: 20000,
  });

  console.log(`Informes de CSP en los ultimos ${dias} dia(s): ${informes.length}`);

  if (informes.length === 0) {
    console.log("\nSin informes. Puede significar dos cosas:");
    console.log("  - la politica estricta no bloquea nada (buena senal), o");
    console.log("  - los navegadores no estan enviando informes (revisar la cabecera).");
  } else {
    const directivas = new Map();
    const bloqueados = new Map();
    const paginas = new Map();
    const disposiciones = new Map();

    for (const informe of informes) {
      directivas.set(informe.directive, (directivas.get(informe.directive) ?? 0) + 1);
      bloqueados.set(informe.blockedUri ?? "(sin datos)", (bloqueados.get(informe.blockedUri ?? "(sin datos)") ?? 0) + 1);
      paginas.set(informe.documentUri ?? "(sin datos)", (paginas.get(informe.documentUri ?? "(sin datos)") ?? 0) + 1);
      disposiciones.set(informe.disposition, (disposiciones.get(informe.disposition) ?? 0) + 1);
    }

    tabla("Directivas que habrian bloqueado algo:", directivas);
    tabla("Que se intentaba cargar:", bloqueados);
    tabla("Paginas afectadas:", paginas);
    tabla("Disposicion:", disposiciones);

    const inlineEnScripts = informes.some(
      (informe) => informe.directive.startsWith("script-src") && informe.blockedUri === "inline",
    );
    const inlineEnEstilos = informes.some(
      (informe) => informe.directive.startsWith("style-src") && informe.blockedUri === "inline",
    );

    console.log("\nDiagnostico:");
    console.log(
      inlineEnScripts
        ? "  - script-src todavia necesita nonces: hay scripts inline."
        : "  - script-src: sin scripts inline en la ventana analizada.",
    );
    console.log(
      inlineEnEstilos
        ? "  - style-src todavia necesita 'unsafe-inline' (o nonces + style-src-attr)."
        : "  - style-src: sin estilos inline en la ventana analizada.",
    );
    console.log(
      inlineEnScripts || inlineEnEstilos
        ? "\nConclusion: NO activar todavia. Quedan violaciones de tipo `inline`."
        : "\nConclusion: la ventana esta limpia; revisar una ventana mas larga antes de activar.",
    );
  }

  if (limpiar && informes.length > 0) {
    const borrados = await prisma.cspViolation.deleteMany({ where: { createdAt: { gte: desde } } });

    console.log(`\nSe eliminaron ${borrados.count} informe(s) de la ventana analizada.`);
  } else if (informes.length > 0) {
    console.log("\n(Simulacro: los informes siguen guardados. Usa --limpiar para borrarlos.)");
  }
} catch (error) {
  console.error("Fallo:", error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
