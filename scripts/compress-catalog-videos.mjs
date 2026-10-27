/**
 * Comprime los videos del catalogo a MP4 (H.264 + AAC) por debajo del limite de
 * 25 MiB por archivo que impone Cloudflare Workers.
 *
 * Por que existe: los originales (.MOV de 72 a 133 MiB) no se pueden subir como
 * assets del Worker, por eso el sitio devolvia 404 al pedirlos. Ademas los .MOV
 * no se reproducen en varios navegadores (Chrome/Android). Este script genera el
 * .mp4 optimizado que si se sirve.
 *
 * Los originales NO se borran: quedan en `public/` (ignorados por el despliegue
 * via `.assetsignore`) y en `storage-videos/`. Si el .mp4 ya existia, se mueve a
 * `storage-videos/descarte/` antes de sobrescribirlo.
 *
 * Uso:
 *   node scripts/compress-catalog-videos.mjs
 *   node scripts/compress-catalog-videos.mjs videocarru5.MOV   (solo uno)
 */
import { existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "..", "public");
const discardDir = path.resolve(__dirname, "..", "storage-videos", "descarte");

const MAX_BYTES = 24 * 1024 * 1024;

/** Planes de compresion: se prueban en orden hasta bajar de MAX_BYTES. */
const LADDER = [
  { crf: 30, height: 1280, audioBitrate: "96k" },
  { crf: 33, height: 960, audioBitrate: "80k" },
  { crf: 36, height: 720, audioBitrate: "64k" },
];

const DEFAULT_TARGETS = [
  "videocarru2nuevo.MOV",
  "videocarru3.MOV",
  "videocarru4nuevo.MOV",
  "videocarru5.MOV",
  "videocarru6nuevo.MOV",
];

const requested = process.argv.slice(2);
const inputs = requested.length ? requested : DEFAULT_TARGETS;

function megabytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function backupExisting(output) {
  if (!existsSync(output)) return;

  mkdirSync(discardDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const target = path.join(discardDir, `${path.basename(output, ".mp4")}-${stamp}.mp4`);
  renameSync(output, target);
  console.log(`[comprimir] anterior guardado en ${path.relative(process.cwd(), target)}`);
}

function convert(input, output, plan) {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .videoCodec("libx264")
      .audioCodec("aac")
      .outputOptions([
        "-movflags +faststart",
        "-pix_fmt yuv420p",
        "-preset slow",
        `-crf ${plan.crf}`,
        "-r 30",
        `-vf scale=-2:'min(${plan.height},ih)'`,
        `-b:a ${plan.audioBitrate}`,
      ])
      .on("end", resolve)
      .on("error", (error) => reject(new Error(`ffmpeg fallo con ${path.basename(input)}: ${error.message}`)))
      .save(output);
  });
}

ffmpeg.setFfmpegPath(ffmpegPath);

let pending = 0;

for (const name of inputs) {
  const input = path.join(publicDir, name);

  if (!existsSync(input)) {
    console.error(`[comprimir] no existe ${name}: se omite.`);
    pending += 1;
    continue;
  }

  const output = path.join(publicDir, name.replace(/\.MOV$/i, ".mp4"));
  const originalSize = statSync(input).size;
  let done = false;

  for (const plan of LADDER) {
    backupExisting(output);
    console.log(`[comprimir] ${name} (${megabytes(originalSize)}) -> CRF ${plan.crf}, alto ${plan.height}px`);

    try {
      await convert(input, output, plan);
    } catch (error) {
      console.error(`[comprimir] ${error.message}`);
      break;
    }

    const size = statSync(output).size;
    console.log(`[comprimir]   resultado: ${megabytes(size)}`);

    if (size <= MAX_BYTES) {
      done = true;
      console.log(`[comprimir] OK ${path.basename(output)} (${megabytes(size)})`);
      break;
    }

    console.log("[comprimir]   sigue por encima de 24 MiB: se reintenta con mas compresion.");
  }

  if (!done) {
    console.error(`[comprimir] ${name}: no se logro bajar de 24 MiB. Revisar a mano.`);
    pending += 1;
  }
}

if (pending > 0) {
  console.error(`[comprimir] ${pending} archivo(s) pendientes.`);
  process.exit(1);
}

console.log("[comprimir] LISTO");
