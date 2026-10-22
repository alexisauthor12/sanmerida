/**
 * Excluye del bundle de assets de Cloudflare los archivos que superan el limite
 * de la plataforma (25 MiB por archivo).
 *
 * Los videos del sitio pesan hasta 133 MiB: no se pueden subir como assets de
 * Worker. Se quedan en `public/` (y en Git, sin perderse), pero se listan en
 * `.open-next/assets/.assetsignore` para que `wrangler deploy` los omita y el
 * despliegue no falle con "Asset too large".
 *
 * Uso: se ejecuta automaticamente al final de `npm run build:cf`.
 */
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ASSETS_DIR = ".open-next/assets";
const MAX_ASSET_BYTES = 25 * 1024 * 1024;
const IGNORE_FILE = join(ASSETS_DIR, ".assetsignore");

function collectFiles(directory) {
  const files = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectFiles(full));
      continue;
    }

    files.push(full);
  }

  return files;
}

let files;

try {
  files = collectFiles(ASSETS_DIR);
} catch {
  console.error(`[assets] No existe ${ASSETS_DIR}. Ejecuta el build antes de este paso.`);
  process.exit(1);
}

const oversized = files
  .map((file) => ({ file, size: statSync(file).size }))
  .filter((item) => item.size > MAX_ASSET_BYTES)
  .map((item) => ({
    relativePath: relative(ASSETS_DIR, item.file).split(sep).join("/"),
    size: item.size,
  }));

const header = [
  "# Generado por scripts/exclude-large-assets.mjs",
  `# Archivos mayores a ${MAX_ASSET_BYTES / (1024 * 1024)} MiB: Cloudflare no los acepta como assets.`,
  "",
].join("\n");

writeFileSync(
  IGNORE_FILE,
  `${header}${oversized.map((item) => item.relativePath).join("\n")}${oversized.length ? "\n" : ""}`,
  "utf8",
);

console.log(
  oversized.length
    ? `[assets] ${oversized.length} archivo(s) excluidos por tamano (>25 MiB):\n${oversized
        .map((item) => `  - ${item.relativePath} (${(item.size / (1024 * 1024)).toFixed(1)} MiB)`)
        .join("\n")}`
    : "[assets] Ningun archivo supera los 25 MiB: bundle completo.",
);
