/**
 * Envoltorio de `opennextjs-cloudflare deploy`.
 *
 * OpenNext necesita una conexión local de Hyperdrive para poder leer los
 * bindings (getPlatformProxy) incluso al desplegar; si falta, el deploy falla
 * con: "When developing locally, you should use a local Postgres connection
 * string to emulate Hyperdrive functionality".
 *
 * Este script define la variable si no existe y ejecuta el deploy real.
 */
import { spawnSync } from "node:child_process";

process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE ??=
  process.env.DATABASE_URL ??
  "postgresql://postgres:localdev@127.0.0.1:5432/postgres";

const result = spawnSync(
  "npx",
  ["opennextjs-cloudflare", "deploy"],
  { stdio: "inherit", shell: true, env: process.env }
);

process.exit(result.status ?? 1);
