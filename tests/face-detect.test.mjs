import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDetectionContext,
  computeIntegralImage,
  detectFaceRect,
  findLargestSkinCluster,
  getRectSum,
} from "../src/lib/face-detect.mjs";

/** Crea una imagen RGBA sintetica. */
function makeImage(width, height, painter) {
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

test("computeIntegralImage y getRectSum suman rectangulos correctamente", () => {
  const binary = new Uint8Array([
    1, 0, 0,
    0, 1, 1,
    0, 0, 1,
  ]);
  const integral = computeIntegralImage(binary, 3, 3);

  assert.equal(getRectSum(integral, 3, 0, 0, 3, 3), 4);
  assert.equal(getRectSum(integral, 3, 1, 1, 2, 2), 3);
  assert.equal(getRectSum(integral, 3, 0, 0, 1, 1), 1);
});

test("buildDetectionContext marca la piel y la luminancia", () => {
  const data = makeImage(120, 120, () => [200, 150, 120]);
  const ctx = buildDetectionContext(data, 120, 120);

  assert.ok(ctx.analysisWidth >= 320, "el analisis se amplia a un minimo de 320");
  assert.equal(ctx.skinMask[0], 1, "un tono de piel debe marcarse");
  assert.ok(ctx.luma[0] > 140 && ctx.luma[0] < 190, "luminancia coherente");
});

test("findLargestSkinCluster encuentra el cumulo mas grande", () => {
  const width = 60;
  const height = 40;
  const mask = new Uint8Array(width * height);

  for (let y = 5; y < 15; y += 1) {
    for (let x = 5; x < 15; x += 1) mask[y * width + x] = 1;
  }

  for (let y = 20; y < 38; y += 1) {
    for (let x = 25; x < 55; x += 1) mask[y * width + x] = 1;
  }

  const ctx = {
    analysisWidth: width,
    analysisHeight: height,
    skinMask: mask,
    integral: computeIntegralImage(mask, width, height),
  };

  const cluster = findLargestSkinCluster(ctx, { left: 0, top: 0, width, height });

  assert.ok(cluster, "debe encontrar el cumulo");
  assert.equal(cluster.left, 25);
  assert.equal(cluster.width, 30);
});

test("findLargestSkinCluster devuelve null si la piel es insuficiente", () => {
  const width = 40;
  const height = 30;
  const mask = new Uint8Array(width * height);
  mask[10] = 1;

  const ctx = {
    analysisWidth: width,
    analysisHeight: height,
    skinMask: mask,
    integral: computeIntegralImage(mask, width, height),
  };

  assert.equal(findLargestSkinCluster(ctx, { left: 0, top: 0, width, height }), null);
});

test("detectFaceRect ubica la cara a la derecha de una cedula", () => {
  const width = 800;
  const height = 500;
  const data = makeImage(width, height, (x, y) => {
    const inPhoto = x > width * 0.62 && x < width * 0.92 && y > height * 0.25 && y < height * 0.85;
    return inPhoto ? [205, 150, 118] : [242, 242, 242];
  });

  const rect = detectFaceRect({ data, width, height });

  assert.ok(rect, "debe detectar una zona");
  const centerX = (rect.left + rect.width / 2) / width;
  assert.ok(centerX > 0.6, `el centro debe estar a la derecha (fue ${centerX.toFixed(2)})`);
  assert.ok(rect.width >= 80 && rect.height >= 100);
});

test("detectFaceRect devuelve la plantilla si no hay piel", () => {
  const width = 600;
  const height = 400;
  const data = makeImage(width, height, () => [240, 240, 240]);

  const rect = detectFaceRect({ data, width, height });

  assert.ok(rect, "siempre devuelve una zona (plantilla de cedula)");
  assert.equal(rect.source, "cedula-template");
  assert.ok((rect.left + rect.width / 2) / width > 0.6, "la plantilla esta a la derecha");
});

test("detectFaceRect rechaza imagenes demasiado pequenas", () => {
  assert.equal(detectFaceRect({ data: new Uint8ClampedArray(40 * 40 * 4), width: 40, height: 40 }), null);
});
