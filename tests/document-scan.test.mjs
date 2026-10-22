import test from "node:test";
import assert from "node:assert/strict";
import {
  boxBlurGray,
  buildToneLut,
  histogramOf,
  luminanceFromRgba,
  percentileFromHistogram,
  scanImageData,
  scanModeForDocument,
  stretchLevels,
  unsharpMask,
} from "../src/lib/document-scan.mjs";

/** Crea un RGBA de prueba. */
function makeRgba(width, height, painter) {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = (y * width + x) * 4;
      const [r, g, b] = painter(x, y);
      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = 255;
    }
  }

  return data;
}

function grayAt(data, width, x, y) {
  return data[(y * width + x) * 4];
}

test("luminanceFromRgba convierte a escala de grises con los pesos correctos", () => {
  const data = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 0, 255, 0, 255]);
  const gray = luminanceFromRgba(data, 3, 1);

  assert.equal(gray[0], 255);
  assert.equal(gray[1], 0);
  assert.equal(gray[2], 150);
});

test("boxBlurGray conserva una imagen plana", () => {
  const width = 20;
  const height = 20;
  const gray = new Uint8ClampedArray(width * height).fill(120);
  const blurred = boxBlurGray(gray, width, height, 3);

  for (const value of blurred) {
    assert.ok(Math.abs(value - 120) <= 1);
  }
});

test("histogramOf y percentileFromHistogram ubican el percentil", () => {
  const gray = new Uint8ClampedArray([0, 0, 0, 0, 200, 200, 255, 255, 255, 255]);
  const histogram = histogramOf(gray);

  assert.equal(percentileFromHistogram(histogram, gray.length, 0), 0);
  assert.equal(percentileFromHistogram(histogram, gray.length, 50), 200);
  assert.equal(percentileFromHistogram(histogram, gray.length, 100), 255);
});

test("stretchLevels lleva el rango pedido a 0-255", () => {
  const gray = new Uint8ClampedArray([100, 150, 200]);
  const stretched = stretchLevels(gray, 100, 200);

  assert.equal(stretched[0], 0);
  assert.equal(Math.round(stretched[1]), 128);
  assert.equal(stretched[2], 255);
});

test("buildToneLut es monotona y aplica recorte de blancos", () => {
  const lut = buildToneLut({ contrast: 1.2, whiteClip: 208, whiteKeep: 0.3, blackClip: 72, blackKeep: 0.32 });

  for (let value = 1; value < 256; value += 1) {
    assert.ok(lut[value] >= lut[value - 1]);
  }

  assert.equal(lut[0], 0);
  assert.equal(lut[255], 255);
  assert.ok(lut[250] >= 250);
});

test("unsharpMask devuelve los mismos pixeles en una imagen plana", () => {
  const width = 10;
  const height = 10;
  const gray = new Uint8ClampedArray(width * height).fill(90);
  const sharpened = unsharpMask(gray, width, height, 0.8);

  for (const value of sharpened) {
    assert.ok(Math.abs(value - 90) <= 1);
  }
});

test("scanImageData en modo documento deja papel blanco y texto oscuro", () => {
  const width = 240;
  const height = 160;
  // Papel gris con una sombra diagonal (esquina oscura) y "texto" oscuro.
  const data = makeRgba(width, height, (x, y) => {
    const shadow = 1 - (x / width) * 0.45 - (y / height) * 0.15;
    const isText = y > 70 && y < 80 && x > 40 && x < 200;

    if (isText) {
      const value = Math.round(40 * shadow);
      return [value, value, value];
    }

    const paper = Math.round(168 * shadow);
    return [paper, paper, paper];
  });

  scanImageData({ data, width, height, mode: "documento", intensity: "clean" });

  const paperCorner = grayAt(data, width, 5, 5);
  const paperBright = grayAt(data, width, 230, 10);
  const textPixel = grayAt(data, width, 120, 75);

  assert.ok(paperCorner > 230, `papel en sombra deberia quedar blanco, quedo ${paperCorner}`);
  assert.ok(paperBright > 230, `papel iluminado deberia quedar blanco, quedo ${paperBright}`);
  assert.ok(textPixel < 120, `el texto deberia quedar oscuro, quedo ${textPixel}`);
  assert.equal(grayAt(data, width, 120, 75), data[(75 * width + 120) * 4 + 1], "debe quedar en gris puro");
});

test("scanImageData en modo foto conserva el color y aclara", () => {
  const width = 60;
  const height = 60;
  const data = makeRgba(width, height, () => [180, 120, 90]);

  scanImageData({ data, width, height, mode: "foto", intensity: "normal" });

  const p = (10 * width + 10) * 4;

  assert.ok(data[p] > data[p + 2], "debe mantener el tono calido");
  assert.ok(data[p] > 180, "deberia aclarar la foto");
  assert.equal(data[p + 3], 255);
});

test("scanModeForDocument usa foto solo para la selfie", () => {
  assert.equal(scanModeForDocument("selfie"), "foto");
  assert.equal(scanModeForDocument("identidad"), "documento");
  assert.equal(scanModeForDocument("rif"), "documento");
  assert.equal(scanModeForDocument("principal"), "documento");
});
