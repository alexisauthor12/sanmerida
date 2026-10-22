/**
 * Escaner de documentos: algoritmo puro sobre pixeles.
 *
 * Se usa desde el navegador (canvas -> ImageData -> este modulo -> JPEG) y desde
 * los scripts de verificacion en Node (sharp -> raw -> este modulo). Al no
 * depender de `sharp` ni del DOM, funciona igual en desarrollo y en Cloudflare
 * Workers, y se puede medir objetivamente.
 *
 * Objetivo de calidad:
 *  - papel realmente blanco (sin fondo gris ni sombras de la mesa)
 *  - texto oscuro y nitido
 *  - sin reventar luces ni perder la foto del documento de identidad
 *
 * Modos:
 *  - "documento": escala de grises de alto contraste (cedula, RIF, licencia,
 *    certificado de origen, contratos).
 *  - "foto": conserva el color y solo corrige luz/balance (selfie).
 *
 * Intensidades:
 *  - "normal": correccion suave.
 *  - "clean": correccion fuerte tipo escaner de oficina.
 */

export const SCAN_INTENSITIES = {
  normal: {
    flattenMix: 0.7,
    maxGain: 2.4,
    lowPercentile: 0.4,
    highPercentile: 99.2,
    contrast: 1.1,
    lift: -6,
    gamma: 1,
    sharpen: 0.55,
    blackClip: 50,
    whiteClip: 240,
    blackKeep: 0.6,
    whiteKeep: 0.65,
  },
  clean: {
    flattenMix: 0.88,
    maxGain: 2.8,
    lowPercentile: 0.8,
    highPercentile: 99.5,
    contrast: 1.18,
    lift: -11,
    gamma: 0.96,
    sharpen: 0.75,
    blackClip: 68,
    whiteClip: 222,
    blackKeep: 0.35,
    whiteKeep: 0.45,
  },
};

export const PHOTO_INTENSITIES = {
  normal: {
    targetHighlight: 246,
    maxGain: 1.35,
    contrast: 1.05,
    lift: 2,
    gamma: 1,
    sharpen: 0.35,
  },
  clean: {
    targetHighlight: 250,
    maxGain: 1.5,
    contrast: 1.1,
    lift: 4,
    gamma: 0.98,
    sharpen: 0.5,
  },
};

const LUMA_R = 0.299;
const LUMA_G = 0.587;
const LUMA_B = 0.114;

function clampByte(value) {
  return value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
}

function normalizeIntensity(intensity) {
  return intensity === "clean" ? "clean" : "normal";
}

/** Luminancia (0-255) por pixel a partir de RGBA. */
export function luminanceFromRgba(data, width, height) {
  const gray = new Uint8ClampedArray(width * height);

  for (let i = 0, p = 0; i < gray.length; i += 1, p += 4) {
    gray[i] = LUMA_R * data[p] + LUMA_G * data[p + 1] + LUMA_B * data[p + 2];
  }

  return gray;
}

/** Imagen integral (para sumas de rectangulos en O(1)). */
export function buildIntegralImage(gray, width, height) {
  const stride = width + 1;
  const integral = new Int32Array(stride * (height + 1));

  for (let y = 1; y <= height; y += 1) {
    let rowSum = 0;
    for (let x = 1; x <= width; x += 1) {
      rowSum += gray[(y - 1) * width + (x - 1)];
      integral[y * stride + x] = integral[(y - 1) * stride + x] + rowSum;
    }
  }

  return integral;
}

function rectSum(integral, width, left, top, rectWidth, rectHeight) {
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

/** Desenfoque de caja (fondo local) usando imagen integral. */
export function boxBlurGray(gray, width, height, radius) {
  const safeRadius = Math.max(1, Math.round(radius));
  const integral = buildIntegralImage(gray, width, height);
  const out = new Uint8ClampedArray(width * height);

  for (let y = 0; y < height; y += 1) {
    const top = Math.max(0, y - safeRadius);
    const bottom = Math.min(height - 1, y + safeRadius);
    const rectHeight = bottom - top + 1;

    for (let x = 0; x < width; x += 1) {
      const left = Math.max(0, x - safeRadius);
      const right = Math.min(width - 1, x + safeRadius);
      const rectWidth = right - left + 1;
      const sum = rectSum(integral, width, left, top, rectWidth, rectHeight);

      out[y * width + x] = sum / (rectWidth * rectHeight);
    }
  }

  return out;
}

export function histogramOf(gray) {
  const histogram = new Uint32Array(256);

  for (let i = 0; i < gray.length; i += 1) {
    histogram[gray[i]] += 1;
  }

  return histogram;
}

/** Valor de pixel correspondiente a un percentil (0-100). */
export function percentileFromHistogram(histogram, total, percentile) {
  const target = Math.max(1, Math.round((total * Math.min(100, Math.max(0, percentile))) / 100));
  let accumulated = 0;

  for (let value = 0; value < 256; value += 1) {
    accumulated += histogram[value];
    if (accumulated >= target) return value;
  }

  return 255;
}

/**
 * Aplana la iluminacion: divide cada pixel por el fondo local. Es lo que hace
 * que desaparezcan las sombras y el fondo de la mesa sin perder el texto.
 */
export function flattenIllumination(gray, width, height, options = {}) {
  const mix = options.mix ?? 0.7;
  const maxGain = options.maxGain ?? 2.4;
  const radius = options.radius ?? Math.max(8, Math.round(Math.min(width, height) / 14));
  const background = boxBlurGray(gray, width, height, radius);
  const out = new Uint8ClampedArray(gray.length);

  for (let i = 0; i < gray.length; i += 1) {
    const bg = Math.max(background[i], 8);
    const gain = Math.min(maxGain, 255 / bg);
    const flattened = gray[i] * gain;

    out[i] = gray[i] * (1 - mix) + flattened * mix;
  }

  return out;
}

/** Estira niveles entre dos percentiles al rango completo 0-255. */
export function stretchLevels(gray, low, high) {
  const span = Math.max(1, high - low);
  const out = new Uint8ClampedArray(gray.length);

  for (let i = 0; i < gray.length; i += 1) {
    out[i] = ((gray[i] - low) / span) * 255;
  }

  return out;
}

/**
 * Tabla de tono: contraste alrededor del gris medio, ajuste de brillo, gamma y
 * recorte suave de negros/blancos (deja el papel limpio sin destrozar fotos).
 */
export function buildToneLut(options = {}) {
  const contrast = options.contrast ?? 1;
  const lift = options.lift ?? 0;
  const gamma = options.gamma ?? 1;
  const blackClip = options.blackClip ?? 0;
  const whiteClip = options.whiteClip ?? 255;
  const blackKeep = options.blackKeep ?? 1;
  const whiteKeep = options.whiteKeep ?? 1;
  const lut = new Uint8ClampedArray(256);

  for (let value = 0; value < 256; value += 1) {
    let result = (value / 255 - 0.5) * contrast + 0.5;
    result = result * 255 + lift;

    if (gamma !== 1) {
      result = 255 * Math.pow(Math.max(result, 0) / 255, gamma);
    }

    if (result < blackClip) {
      result *= blackKeep;
    }

    if (result > whiteClip) {
      result = 255 - (255 - result) * whiteKeep;
    }

    lut[value] = clampByte(result);
  }

  return lut;
}

export function applyLut(gray, lut) {
  const out = new Uint8ClampedArray(gray.length);

  for (let i = 0; i < gray.length; i += 1) {
    out[i] = lut[gray[i]];
  }

  return out;
}

/** Enfoque (unsharp mask) para que el texto quede nitido. */
export function unsharpMask(gray, width, height, amount) {
  if (amount <= 0) return gray;

  const blurred = boxBlurGray(gray, width, height, 1);
  const out = new Uint8ClampedArray(gray.length);

  for (let i = 0; i < gray.length; i += 1) {
    out[i] = gray[i] + amount * (gray[i] - blurred[i]);
  }

  return out;
}

/** Procesa un documento en escala de grises y devuelve la luminancia final. */
export function scanDocumentGray(gray, width, height, intensity = "normal") {
  const preset = SCAN_INTENSITIES[normalizeIntensity(intensity)];
  const total = gray.length;

  const flattened = flattenIllumination(gray, width, height, {
    mix: preset.flattenMix,
    maxGain: preset.maxGain,
  });

  const histogram = histogramOf(flattened);
  const low = percentileFromHistogram(histogram, total, preset.lowPercentile);
  const high = percentileFromHistogram(histogram, total, preset.highPercentile);
  const stretched = stretchLevels(flattened, low, Math.max(high, low + 8));

  const lut = buildToneLut({
    contrast: preset.contrast,
    lift: preset.lift,
    gamma: preset.gamma,
    blackClip: preset.blackClip,
    whiteClip: preset.whiteClip,
    blackKeep: preset.blackKeep,
    whiteKeep: preset.whiteKeep,
  });
  const toned = applyLut(stretched, lut);

  return unsharpMask(toned, width, height, preset.sharpen);
}

/** Mejora una foto a color (selfie): balance de blancos y luz, sin grises. */
export function enhancePhotoRgba(data, width, height, intensity = "normal") {
  const preset = PHOTO_INTENSITIES[normalizeIntensity(intensity)];
  const pixels = width * height;
  const histograms = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];

  for (let i = 0, p = 0; i < pixels; i += 1, p += 4) {
    histograms[0][data[p]] += 1;
    histograms[1][data[p + 1]] += 1;
    histograms[2][data[p + 2]] += 1;
  }

  const gains = histograms.map((histogram) => {
    const highlight = percentileFromHistogram(histogram, pixels, 98);
    const gain = highlight > 0 ? preset.targetHighlight / highlight : 1;
    return Math.min(preset.maxGain, Math.max(1, gain));
  });

  const lut = buildToneLut({ contrast: preset.contrast, lift: preset.lift, gamma: preset.gamma });

  for (let i = 0, p = 0; i < pixels; i += 1, p += 4) {
    data[p] = lut[clampByte(data[p] * gains[0])];
    data[p + 1] = lut[clampByte(data[p + 1] * gains[1])];
    data[p + 2] = lut[clampByte(data[p + 2] * gains[2])];
  }

  if (preset.sharpen > 0) {
    const gray = luminanceFromRgba(data, width, height);
    const blurred = boxBlurGray(gray, width, height, 1);

    for (let i = 0, p = 0; i < pixels; i += 1, p += 4) {
      const delta = preset.sharpen * (gray[i] - blurred[i]);

      data[p] = clampByte(data[p] + delta);
      data[p + 1] = clampByte(data[p + 1] + delta);
      data[p + 2] = clampByte(data[p + 2] + delta);
    }
  }

  return data;
}

/**
 * Punto de entrada: procesa RGBA en el lugar y devuelve los mismos datos.
 * `mode` acepta "documento" (por defecto) o "foto".
 */
export function scanImageData({ data, width, height, mode = "documento", intensity = "normal" }) {
  if (!data || width <= 0 || height <= 0) return data;

  if (mode === "foto") {
    return enhancePhotoRgba(data, width, height, intensity);
  }

  const gray = scanDocumentGray(luminanceFromRgba(data, width, height), width, height, intensity);

  for (let i = 0, p = 0; i < gray.length; i += 1, p += 4) {
    data[p] = gray[i];
    data[p + 1] = gray[i];
    data[p + 2] = gray[i];
    data[p + 3] = 255;
  }

  return data;
}

/** Modo de escaneo sugerido para cada documento del expediente. */
export function scanModeForDocument(documentKey) {
  return documentKey === "selfie" ? "foto" : "documento";
}
