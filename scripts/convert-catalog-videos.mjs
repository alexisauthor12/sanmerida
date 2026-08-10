import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "..", "public");

const files = [
  "videocarru1.MOV",
  "videocarru2nuevo.MOV",
  "videocarru3.MOV",
  "videocarru4nuevo.MOV",
  "videocarru5.MOV",
  "videocarru6nuevo.MOV",
];

ffmpeg.setFfmpegPath(ffmpegPath);

function convertOne(inputName) {
  return new Promise((resolve, reject) => {
    const input = path.join(publicDir, inputName);
    const output = path.join(publicDir, inputName.replace(/\.MOV$/i, ".mp4"));

    ffmpeg(input)
      .videoCodec("libx264")
      .audioCodec("aac")
      .outputOptions(["-movflags +faststart", "-pix_fmt yuv420p", "-preset veryfast", "-crf 23"])
      .on("end", () => {
        console.log(`OK ${inputName} -> ${path.basename(output)}`);
        resolve();
      })
      .on("error", (error) => {
        reject(new Error(`Error convirtiendo ${inputName}: ${error.message}`));
      })
      .save(output);
  });
}

for (const file of files) {
  await convertOne(file);
}

console.log("Conversion completada.");
