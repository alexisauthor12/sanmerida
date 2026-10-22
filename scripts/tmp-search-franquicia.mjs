/**
 * Busca cualquier rastro de "franquicia" / "publicacion" en la base de datos.
 * Uso: node scripts/tmp-search-franquicia.mjs
 */
import "dotenv/config";
import { Client } from "pg";

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

const tables = await (async () => {
  const result = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`
  );
  return result.rows.map((row) => row.table_name);
})();

try {
  await client.connect();
  console.log("Tablas:", tables.join(", "));

  for (const table of tables) {
    const columns = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND data_type IN ('text','character varying','character') ORDER BY column_name`,
      [table]
    );

    if (columns.rows.length === 0) continue;

    const conditions = columns.rows.map((column) => `"${column.column_name}" ILIKE '%franquici%'`).join(" OR ");
    const query = `SELECT * FROM "${table}" WHERE ${conditions} LIMIT 5`;

    try {
      const found = await client.query(query);
      if (found.rows.length > 0) {
        console.log(`\n>>> ${table}: ${found.rows.length} coincidencia(s)`);
        for (const row of found.rows) console.log(JSON.stringify(row).slice(0, 400));
      }
    } catch (error) {
      console.log(`${table}: error -> ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log("\nFIN");
} catch (error) {
  console.error("[ERROR]", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
