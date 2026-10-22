/**
 * Deteccion de la cara en una cedula: algoritmo puro sobre pixeles.
 *
 * Es el MISMO algoritmo que existia en el servidor (mascara de piel + imagen
 * integral + mayor cumulo + ventana deslizante + plantilla de cedula + bandas
 * faciales/simetria), pero portado a JavaScript puro para poder ejecutarlo en
 * el NAVEGADOR. Asi funciona tambien en Cloudflare, donde `sharp` no existe.
 *
 * Entrada: RGBA (ImageData del canvas). Salida: rectangulo absoluto de la cara
 * dentro de la imagen original.
 */

const SKIN_MIN_AREA = 450;
const MAX_ANALYSIS_WIDTH = 1200;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Imagen integral del mapa binario (suma de rectangulos en O(1)). */
export function computeIntegralImage(binary, width, height) {
  const stride = width + 1;
  const integral = new Int32Array(stride * (height + 1));

  for (let y = 1; y <= height; y += 1) {
    let rowSum = 0;
    for (let x = 1; x <= width; x += 1) {
      rowSum += binary[(y - 1) * width + (x - 1)] || 0;
      integral[y * stride + x] = integral[(y - 1) * stride + x] + rowSum;
    }
  }

  return integral;
}

export function getRectSum(integral, width, left, top, rectWidth, rectHeight) {
  const stride = width + 1;
  const x1 = left;
  const y1 = top;
  const x2 = left + rectWidth;
  const y2 = top + rectHeight;

  return (
    integral[y2 * stride + x2] -
    integral[y1 * stride + x2] -
    integral[y2 * stride + x1] +
    integral[y1 * stride + x1]
  );
}

/**
 * Prepara los datos de analisis (piel + luminancia) reduciendo la imagen por
 * muestreo. Devuelve el contexto que usan los detectores.
 */
export function buildDetectionContext(data, width, height) {
  const scale = width > MAX_ANALYSIS_WIDTH ? MAX_ANALYSIS_WIDTH / width : 1;
  const analysisWidth = Math.max(320, Math.round(width * scale));
  const analysisHeight = Math.max(220, Math.round(height * scale));
  const skinMask = new Uint8Array(analysisWidth * analysisHeight);
  const luma = new Uint8Array(analysisWidth * analysisHeight);
  const stepX = width / analysisWidth;
  const stepY = height / analysisHeight;

  for (let y = 0; y < analysisHeight; y += 1) {
    const sourceY = Math.min(height - 1, Math.floor(y * stepY));

    for (let x = 0; x < analysisWidth; x += 1) {
      const sourceX = Math.min(width - 1, Math.floor(x * stepX));
      const p = (sourceY * width + sourceX) * 4;
      const r = data[p] || 0;
      const g = data[p + 1] || 0;
      const b = data[p + 2] || 0;
      const index = y * analysisWidth + x;

      luma[index] = Math.round((r * 299 + g * 587 + b * 114) / 1000);

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const isSkin =
        r > 80 && g > 40 && b > 20 && max - min > 12 && Math.abs(r - g) > 8 && r > g && r > b;

      skinMask[index] = isSkin ? 1 : 0;
    }
  }

  return {
    imageWidth: width,
    imageHeight: height,
    analysisWidth,
    analysisHeight,
    scale,
    skinMask,
    luma,
    integral: computeIntegralImage(skinMask, analysisWidth, analysisHeight),
  };
}

/** Convierte un rectangulo de analisis a coordenadas de la imagen original. */
export function toAbsoluteRect(ctx, rect) {
  const inverseScale = 1 / ctx.scale;
  const left = clamp(Math.round(rect.left * inverseScale), 0, ctx.imageWidth - 1);
  const top = clamp(Math.round(rect.top * inverseScale), 0, ctx.imageHeight - 1);
  const right = clamp(Math.round((rect.left + rect.width) * inverseScale), left + 1, ctx.imageWidth);
  const bottom = clamp(Math.round((rect.top + rect.height) * inverseScale), top + 1, ctx.imageHeight);

  return {
    left,
    top,
    width: Math.max(80, right - left),
    height: Math.max(100, bottom - top),
  };
}

/** Mayor cumulo conectado de piel dentro de una zona de busqueda. */
export function findLargestSkinCluster(ctx, search) {
  const { analysisWidth, analysisHeight, skinMask } = ctx;
  const leftBound = clamp(search.left, 0, analysisWidth - 1);
  const topBound = clamp(search.top, 0, analysisHeight - 1);
  const rightBound = clamp(search.left + search.width, leftBound + 1, analysisWidth);
  const bottomBound = clamp(search.top + search.height, topBound + 1, analysisHeight);
  const visited = new Uint8Array(analysisWidth * analysisHeight);

  let best = null;

  for (let y = topBound; y < bottomBound; y += 1) {
    for (let x = leftBound; x < rightBound; x += 1) {
      const startIndex = y * analysisWidth + x;
      if (visited[startIndex] || !skinMask[startIndex]) continue;

      const queue = [startIndex];
      visited[startIndex] = 1;

      let area = 0;
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;

      while (queue.length > 0) {
        const index = queue.pop();
        const cx = index % analysisWidth;
        const cy = Math.floor(index / analysisWidth);

        area += 1;
        if (cx < minX) minX = cx;
        if (cy < minY) minY = cy;
        if (cx > maxX) maxX = cx;
        if (cy > maxY) maxY = cy;

        const neighbours = [
          index - 1,
          index + 1,
          index - analysisWidth,
          index + analysisWidth,
          index - analysisWidth - 1,
          index - analysisWidth + 1,
          index + analysisWidth - 1,
          index + analysisWidth + 1,
        ];

        for (const next of neighbours) {
          if (next < 0 || next >= skinMask.length) continue;

          const nx = next % analysisWidth;
          const ny = Math.floor(next / analysisWidth);

          if (nx < leftBound || nx >= rightBound || ny < topBound || ny >= bottomBound) continue;
          if (visited[next] || !skinMask[next]) continue;

          visited[next] = 1;
          queue.push(next);
        }
      }

      if (!best || area > best.area) {
        best = { area, minX, minY, maxX, maxY };
      }
    }
  }

  if (!best || best.area < SKIN_MIN_AREA) return null;

  return {
    left: best.minX,
    top: best.minY,
    width: best.maxX - best.minX + 1,
    height: best.maxY - best.minY + 1,
  };
}

/** Detecta la cara por el mayor cumulo de piel en la zona del retrato. */
export function detectFromPortraitCluster(ctx) {
  const search = {
    left: Math.round(ctx.analysisWidth * 0.55),
    top: Math.round(ctx.analysisHeight * 0.2),
    width: Math.round(ctx.analysisWidth * 0.43),
    height: Math.round(ctx.analysisHeight * 0.78),
  };

  const cluster = findLargestSkinCluster(ctx, search);
  if (!cluster) return null;

  const expandLeft = Math.round(cluster.width * 0.18);
  const expandRight = Math.round(cluster.width * 0.18);
  const expandTop = Math.round(cluster.height * 0.4);
  const expandBottom = Math.round(cluster.height * 0.28);

  const left = clamp(cluster.left - expandLeft, Math.round(ctx.analysisWidth * 0.52), ctx.analysisWidth - 1);
  const top = clamp(cluster.top - expandTop, Math.round(ctx.analysisHeight * 0.15), ctx.analysisHeight - 1);
  const right = clamp(cluster.left + cluster.width + expandRight, left + 1, ctx.analysisWidth);
  const bottom = clamp(cluster.top + cluster.height + expandBottom, top + 1, ctx.analysisHeight);

  const rect = { left, top, width: right - left, height: bottom - top };
  const density =
    getRectSum(ctx.integral, ctx.analysisWidth, left, top, rect.width, rect.height) /
    Math.max(rect.width * rect.height, 1);

  if (density < 0.11) return null;

  return { ...toAbsoluteRect(ctx, rect), confidence: 0.88 + Math.min(0.08, density), source: "portrait-cluster" };
}

/** Zona tipica de la foto en una cedula venezolana (plantilla). */
export function detectFromCedulaTemplate(ctx) {
  const rect = {
    left: Math.round(ctx.analysisWidth * 0.6),
    top: Math.round(ctx.analysisHeight * 0.26),
    width: Math.round(ctx.analysisWidth * 0.34),
    height: Math.round(ctx.analysisHeight * 0.66),
  };

  return { ...toAbsoluteRect(ctx, rect), confidence: 0.74, source: "cedula-template" };
}

/** Busca la cara con una ventana deslizante puntuando densidad y posicion. */
export function detectBySlidingWindow(ctx) {
  const widthCandidates = [0.2, 0.24, 0.28, 0.32].map((ratio) => Math.round(ctx.analysisWidth * ratio));
  let best = null;

  for (const width of widthCandidates) {
    const height = Math.round(width * 1.28);
    if (width < 60 || height < 80 || width >= ctx.analysisWidth || height >= ctx.analysisHeight) continue;

    const stepX = Math.max(6, Math.round(width * 0.12));
    const stepY = Math.max(6, Math.round(height * 0.12));
    const minLeft = Math.round(ctx.analysisWidth * 0.48);

    for (let top = Math.round(ctx.analysisHeight * 0.12); top <= ctx.analysisHeight - height; top += stepY) {
      for (let left = minLeft; left <= ctx.analysisWidth - width; left += stepX) {
        const skinCount = getRectSum(ctx.integral, ctx.analysisWidth, left, top, width, height);
        const area = width * height;
        const skinDensity = skinCount / Math.max(area, 1);

        if (skinDensity < 0.1 || skinDensity > 0.74) continue;

        const centerX = left + width / 2;
        const centerY = top + height / 2;
        const xBias = 1 - Math.min(1, Math.abs(centerX - ctx.analysisWidth * 0.78) / (ctx.analysisWidth * 0.5));
        const yBias = 1 - Math.min(1, Math.abs(centerY - ctx.analysisHeight * 0.62) / (ctx.analysisHeight * 0.48));
        const score = skinDensity * 0.5 + xBias * 0.3 + yBias * 0.2;

        if (!best || score > best.score) {
          best = { score, rect: { left, top, width, height } };
        }
      }
    }
  }

  if (!best || best.score < 0.26) return null;

  const expanded = {
    left: clamp(best.rect.left - Math.round(best.rect.width * 0.2), Math.round(ctx.analysisWidth * 0.5), ctx.analysisWidth - 1),
    top: clamp(best.rect.top - Math.round(best.rect.height * 0.34), 0, ctx.analysisHeight - 1),
    width: clamp(best.rect.width + Math.round(best.rect.width * 0.42), 80, ctx.analysisWidth),
    height: clamp(best.rect.height + Math.round(best.rect.height * 0.46), 100, ctx.analysisHeight),
  };

  const right = clamp(expanded.left + expanded.width, expanded.left + 1, ctx.analysisWidth);
  const bottom = clamp(expanded.top + expanded.height, expanded.top + 1, ctx.analysisHeight);

  return {
    ...toAbsoluteRect(ctx, {
      left: expanded.left,
      top: expanded.top,
      width: right - expanded.left,
      height: bottom - expanded.top,
    }),
    confidence: 0.6 + Math.min(0.22, best.score),
    source: "sliding-window",
  };
}

function scoreCandidate(candidate, imageWidth, imageHeight) {
  const centerX = candidate.left + candidate.width / 2;
  const centerY = candidate.top + candidate.height / 2;
  const xBias = 1 - Math.min(1, Math.abs(centerX - imageWidth * 0.77) / (imageWidth * 0.45));
  const yBias = 1 - Math.min(1, Math.abs(centerY - imageHeight * 0.61) / (imageHeight * 0.48));
  const expectedArea = imageWidth * imageHeight * 0.18;
  const area = candidate.width * candidate.height;
  const areaScore = 1 - Math.min(1, Math.abs(area - expectedArea) / expectedArea);

  return candidate.confidence * 0.55 + xBias * 0.2 + yBias * 0.15 + areaScore * 0.1;
}

/** Bandas faciales (ojos/boca/frente) y simetria: confirma que es una cara. */
function scoreFacialBandsAndSymmetry(candidate, ctx) {
  const left = clamp(Math.round(candidate.left * ctx.scale), 0, ctx.analysisWidth - 1);
  const top = clamp(Math.round(candidate.top * ctx.scale), 0, ctx.analysisHeight - 1);
  const right = clamp(Math.round((candidate.left + candidate.width) * ctx.scale), left + 1, ctx.analysisWidth);
  const bottom = clamp(Math.round((candidate.top + candidate.height) * ctx.scale), top + 1, ctx.analysisHeight);
  const width = right - left;
  const height = bottom - top;

  if (width < 24 || height < 30) return 0;

  const eyeY = clamp(top + Math.round(height * 0.4), top, bottom - 1);
  const mouthY = clamp(top + Math.round(height * 0.72), top, bottom - 1);
  const foreheadY = clamp(top + Math.round(height * 0.18), top, bottom - 1);

  let eyeDarkness = 0;
  let mouthDarkness = 0;
  let foreheadLightness = 0;

  for (let x = left; x < right; x += 1) {
    eyeDarkness += 255 - (ctx.luma[eyeY * ctx.analysisWidth + x] ?? 0);
    mouthDarkness += 255 - (ctx.luma[mouthY * ctx.analysisWidth + x] ?? 0);
    foreheadLightness += ctx.luma[foreheadY * ctx.analysisWidth + x] ?? 0;
  }

  let symmetryDelta = 0;
  let samples = 0;
  const half = Math.floor(width / 2);

  for (let y = top; y < bottom; y += 2) {
    for (let x = 0; x < half; x += 1) {
      const l = ctx.luma[y * ctx.analysisWidth + left + x] ?? 0;
      const r = ctx.luma[y * ctx.analysisWidth + (right - 1 - x)] ?? 0;
      symmetryDelta += Math.abs(l - r);
      samples += 1;
    }
  }

  const eyeScore = eyeDarkness / Math.max(width, 1);
  const mouthScore = mouthDarkness / Math.max(width, 1);
  const foreheadScore = foreheadLightness / Math.max(width, 1);
  const symmetryScore = 1 - Math.min(1, symmetryDelta / Math.max(samples, 1) / 64);
  const bandSignal = clamp((eyeScore * 0.45 + mouthScore * 0.35 + foreheadScore * 0.2) / 255, 0, 1);

  return symmetryScore * 0.55 + bandSignal * 0.45;
}

/**
 * Punto de entrada: detecta la cara en una cedula a partir de RGBA.
 * Devuelve el rectangulo (absoluto) con su confianza, o null si no encuentra.
 */
export function detectFaceRect({ data, width, height }) {
  if (!data || width < 80 || height < 80) return null;

  const ctx = buildDetectionContext(data, width, height);
  const candidates = [];

  const portraitCluster = detectFromPortraitCluster(ctx);
  if (portraitCluster) candidates.push(portraitCluster);

  const slidingWindow = detectBySlidingWindow(ctx);
  if (slidingWindow) candidates.push(slidingWindow);

  candidates.push(detectFromCedulaTemplate(ctx));

  let best = null;
  let bestScore = -1;

  for (const candidate of candidates) {
    const facialBandScore = scoreFacialBandsAndSymmetry(candidate, ctx);
    const score = scoreCandidate(candidate, width, height) * 0.8 + facialBandScore * 0.2;

    if (!best || score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  if (!best) return null;

  return {
    left: clamp(best.left, 0, width - 1),
    top: clamp(best.top, 0, height - 1),
    width: clamp(best.width, 80, width),
    height: clamp(best.height, 100, height),
    confidence: best.confidence,
    source: best.source,
  };
}
