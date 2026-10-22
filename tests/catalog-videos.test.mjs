import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const MAX_ASSET_BYTES = 25 * 1024 * 1024;

function readCatalogVideos() {
  const source = readFileSync(path.join(root, "src", "app", "page.tsx"), "utf8");
  const block = source.match(/const videosCatalogo = \[([\s\S]*?)\];/);

  assert.ok(block, "no se encontro el arreglo videosCatalogo en src/app/page.tsx");

  return [...block[1].matchAll(/src:\s*"([^"]+)"/g)].map((match) => match[1]);
}

test("los videos del catalogo se sirven como .mp4", () => {
  const videos = readCatalogVideos();

  assert.ok(videos.length > 0, "el catalogo no tiene videos");

  for (const src of videos) {
    assert.ok(
      src.endsWith(".mp4"),
      `${src} deberia ser .mp4: los .MOV no se reproducen en todos los navegadores`,
    );
  }
});

test("los videos del catalogo existen en public y bajan del limite de Cloudflare", () => {
  for (const src of readCatalogVideos()) {
    const file = path.join(root, "public", src.replace(/^\//, ""));

    assert.ok(existsSync(file), `falta public${src}`);

    const size = statSync(file).size;

    assert.ok(
      size <= MAX_ASSET_BYTES,
      `public${src} pesa ${(size / (1024 * 1024)).toFixed(1)} MiB: Cloudflare rechaza assets de mas de 25 MiB (usar scripts/compress-catalog-videos.mjs)`,
    );
  }
});
