import { PDFDocument } from "pdf-lib";
import { scanImageData, scanModeForDocument } from "@/lib/document-scan.mjs";
import { detectFaceRect } from "@/lib/face-detect.mjs";

/**
 * Escaner de documentos en el NAVEGADOR.
 *
 * Por que en el navegador y no en el servidor:
 *  - es instantaneo (no hay que subir y esperar al servidor),
 *  - funciona tambien en Cloudflare Workers (el servidor usaba `sharp`, que es
 *    un modulo nativo que no existe ahi),
 *  - el usuario ve el resultado al momento.
 *
 * El algoritmo de pixeles vive en `@/lib/document-scan.mjs` (compartido y
 * testeado en Node).
 */

export type ScanIntensity = "normal" | "clean";
export type ScannedImage = {
  blob: Blob;
  width: number;
  height: number;
  intensity: ScanIntensity;
};

const DEFAULT_MAX_WIDTH = 1800;
const DEFAULT_QUALITY = 0.9;

type LoadedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
};

/** Carga la imagen respetando la orientacion EXIF (fotos de celular). */
async function loadImage(input: File | Blob): Promise<LoadedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(input, { imageOrientation: "from-image" });

      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close?.(),
      };
    } catch {
      // Continuamos con el metodo clasico (navegadores antiguos).
    }
  }

  const objectUrl = URL.createObjectURL(input);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("No se pudo leer la imagen seleccionada."));
      element.src = objectUrl;
    });

    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

/**
 * Escanea una imagen y devuelve el JPEG resultante.
 * `mode` es "documento" (grises de alto contraste) o "foto" (selfie, a color).
 */
export async function scanImageBlob(
  input: File | Blob,
  options: { mode?: "documento" | "foto"; intensity?: ScanIntensity; maxWidth?: number; quality?: number } = {},
): Promise<ScannedImage> {
  const mode = options.mode ?? "documento";
  const intensity = options.intensity ?? (mode === "foto" ? "normal" : "clean");
  const maxWidth = options.maxWidth ?? DEFAULT_MAX_WIDTH;
  const quality = options.quality ?? DEFAULT_QUALITY;
  const loaded = await loadImage(input);

  try {
    const scale = Math.min(1, maxWidth / Math.max(1, loaded.width));
    const width = Math.max(1, Math.round(loaded.width * scale));
    const height = Math.max(1, Math.round(loaded.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
      throw new Error("El navegador no permite procesar la imagen.");
    }

    context.drawImage(loaded.source, 0, 0, width, height);

    const imageData = context.getImageData(0, 0, width, height);
    scanImageData({ data: imageData.data, width, height, mode, intensity });
    context.putImageData(imageData, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), "image/jpeg", quality);
    });

    if (!blob) {
      throw new Error("No se pudo generar el archivo escaneado.");
    }

    return { blob, width, height, intensity };
  } finally {
    loaded.release();
  }
}

/** Escanea directamente un documento del expediente segun su clave. */
export async function scanDocumentBlob(input: File | Blob, documentKey: string, intensity?: ScanIntensity) {
  return scanImageBlob(input, { mode: scanModeForDocument(documentKey), intensity });
}

export type DetectedFaceCrop = {
  blob: Blob;
  width: number;
  height: number;
  confidence: number;
  source: string;
};

/**
 * Detecta la cara dentro de una cedula y devuelve el recorte listo para usar
 * como selfie de validacion. Es el mismo algoritmo que antes corria en el
 * servidor, pero aqui funciona en cualquier navegador (y en Cloudflare).
 */
export async function detectFaceCropFromImage(
  input: File | Blob,
  options: { maxWidth?: number; quality?: number } = {},
): Promise<DetectedFaceCrop | null> {
  const loaded = await loadImage(input);

  try {
    const analysisWidth = Math.max(320, Math.min(options.maxWidth ?? 1200, loaded.width));
    const scale = analysisWidth / Math.max(1, loaded.width);
    const width = Math.max(1, Math.round(loaded.width * scale));
    const height = Math.max(1, Math.round(loaded.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;

    context.drawImage(loaded.source, 0, 0, width, height);

    const imageData = context.getImageData(0, 0, width, height);
    const rect = detectFaceRect({ data: imageData.data, width, height });

    if (!rect) return null;

    // El detector trabaja sobre la imagen reducida: se devuelve a la escala real.
    const scaleX = loaded.width / width;
    const scaleY = loaded.height / height;
    const sourceLeft = Math.max(0, Math.round(rect.left * scaleX));
    const sourceTop = Math.max(0, Math.round(rect.top * scaleY));
    const sourceWidth = Math.min(loaded.width - sourceLeft, Math.round(rect.width * scaleX));
    const sourceHeight = Math.min(loaded.height - sourceTop, Math.round(rect.height * scaleY));

    if (sourceWidth < 80 || sourceHeight < 100) return null;

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = sourceWidth;
    cropCanvas.height = sourceHeight;

    const cropContext = cropCanvas.getContext("2d");
    if (!cropContext) return null;

    cropContext.drawImage(
      loaded.source,
      sourceLeft,
      sourceTop,
      sourceWidth,
      sourceHeight,
      0,
      0,
      sourceWidth,
      sourceHeight,
    );

    const blob = await new Promise<Blob | null>((resolve) => {
      cropCanvas.toBlob((value) => resolve(value), "image/jpeg", options.quality ?? 0.9);
    });

    if (!blob) return null;

    return {
      blob,
      width: sourceWidth,
      height: sourceHeight,
      confidence: rect.confidence,
      source: rect.source,
    };
  } catch {
    return null;
  } finally {
    loaded.release();
  }
}

/** Genera el PDF digital (una pagina con la imagen escaneada). */
export async function buildScannedPdf(jpegBytes: ArrayBuffer, width: number, height: number): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const image = await pdf.embedJpg(new Uint8Array(jpegBytes));
  const page = pdf.addPage([width, height]);

  page.drawImage(image, { x: 0, y: 0, width, height });

  const bytes = await pdf.save();

  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}

/** Descarga los bytes de un archivo del expediente (con sesion). */
export async function fetchAssetBlob(url: string): Promise<Blob> {
  const response = await fetch(url, { credentials: "same-origin" });

  if (!response.ok) {
    throw new Error("No se pudo leer el documento original para escanearlo.");
  }

  return response.blob();
}
