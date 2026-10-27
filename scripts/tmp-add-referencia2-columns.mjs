/**
 * Aplica las columnas de la SEGUNDA referencia (ubicación) a la base de datos.
 * Uso: node scripts/tmp-add-referencia2-columns.mjs
 */
import "dotenv/config";
import { Client } from "pg";

const statements = [
  'ALTER TABLE "MemberProfile" ADD COLUMN IF NOT EXISTS "referencia2Lat" DOUBLE PRECISION',
  'ALTER TABLE "MemberProfile" ADD COLUMN IF NOT EXISTS "referencia2Lng" DOUBLE PRECISION',
  'ALTER TABLE "MemberProfile" ADD COLUMN IF NOT EXISTS "referencia2Link" TEXT',
];

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
  connectionTimeoutMillis: 20000,
});

try {
  await client.connect();
  console.log("[db]", (process.env.DATABASE_URL ?? "").replace(/:[^:@]+@/, ":***@"));

  for (const sql of statements) {
    await client.query(sql);
    console.log("OK:", sql.replace('ALTER TABLE "MemberProfile" ADD COLUMN IF NOT EXISTS ', ""));
  }

  const cols = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'MemberProfile' AND column_name LIKE 'referencia%' ORDER BY column_name`
  );

  console.log("--- Columnas de referencia ---");
  for (const row of cols.rows) console.log(` ${row.column_name} (${row.data_type})`);
  console.log("LISTO");
} catch (error) {
  console.error("[ERROR]", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
