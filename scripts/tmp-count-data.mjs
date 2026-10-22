/**
 * Conteo rápido de datos en producción (solo lectura).
 * Uso: node scripts/tmp-count-data.mjs
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({
  connectionString: (process.env.DATABASE_URL ?? "").trim().replace(/^['"]|['"]$/g, ""),
  maxUses: 1,
});

const prisma = new PrismaClient({ adapter });

try {
  const counts = {
    users: await prisma.user.count(),
    profiles: await prisma.memberProfile.count(),
    assets: await prisma.memberAsset.count(),
    installments: await prisma.installmentPayment.count(),
    advances: await prisma.advancePayment.count(),
  };
  console.log("Produccion:", JSON.stringify(counts));

  const profiles = await prisma.memberProfile.findMany({
    select: {
      cedula: true,
      username: true,
      ubicacionLat: true,
      ubicacionLng: true,
      referenciaLat: true,
      referencia2Lat: true,
      _count: { select: { assets: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log("\nExpedientes:");
  for (const profile of profiles) {
    console.log(
      ` - ${profile.cedula} | ${profile.username ?? "sin usuario"} | docs=${profile._count.assets} | ubicacion=${profile.ubicacionLat ?? "-"} | ref1=${profile.referenciaLat ?? "-"} | ref2=${profile.referencia2Lat ?? "-"}`
    );
  }

  const leftovers = profiles.filter((profile) => profile.cedula === "99999999");
  console.log(`\nRestos de prueba (99999999): ${leftovers.length}`);
} catch (error) {
  console.error("[ERROR]", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect().catch(() => undefined);
}
