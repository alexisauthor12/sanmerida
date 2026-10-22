import { randomUUID } from "crypto";
import path from "path";
import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import {
  buildAssetKey,
  buildDerivedPdfKey,
  buildDerivedTextKey,
  sanitizeAssetSegment,
  sanitizeCedulaDigits,
} from "@/lib/asset-paths.mjs";
import { readAssetObject, saveAssetObject } from "@/lib/asset-storage";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";

/**
 * `sharp` es un modulo nativo: no esta disponible en Cloudflare Workers. Se
 * carga de forma perezosa para que la ruta devuelva un error controlado en vez
 * de romper la carga del modulo completo.
 */
type SharpFactory = typeof import("sharp");

let sharpFactoryPromise: Promise<SharpFactory> | null = null;

function loadSharp(): Promise<SharpFactory> {
  if (!sharpFactoryPromise) {
    sharpFactoryPromise = import("sharp")
      .then((module) => module.default)
      .catch((error) => {
        sharpFactoryPromise = null;
        throw error;
      });
  }

  return sharpFactoryPromise;
}

type AssetType = "DOCUMENT" | "CONTRACT";
type ScanMode = "normal" | "clean";
type OcrResult = {
  text: string;
  confidence?: number;
};
type OcrWorker = {
  recognize: (image: Buffer) => Promise<{ data: { text: string; confidence?: number } }>;
};

const globalForOcr = globalThis as unknown as {
  workerPromise?: Promise<OcrWorker>;
  queue?: Promise<void>;
};

function sanitizeSegment(value: string) {
  return sanitizeAssetSegment(value);
}

function sanitizeCedula(value: string) {
  return sanitizeCedulaDigits(value);
}

function isImageFile(fileName: string, mimeType?: string | null) {
  if (mimeType?.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(fileName);
}

function isPdfFile(fileName: string, mimeType?: string | null) {
  if (mimeType === "application/pdf") return true;
  return /\.pdf$/i.test(fileName);
}

async function createPdfFromImageAndText(imageBytes: Buffer, ocrText: string, confidence?: number) {
  const sharp = await loadSharp();
  const metadata = await sharp(imageBytes).metadata();
  const width = metadata.width ?? 1200;
  const height = metadata.height ?? 1700;

  const pdfDoc = await PDFDocument.create();
  const imagePage = pdfDoc.addPage([width, height]);
  const embedded = await pdfDoc.embedJpg(imageBytes);

  imagePage.drawImage(embedded, {
    x: 0,
    y: 0,
    width,
    height,
  });

  const textPage = pdfDoc.addPage([595, 842]);
  textPage.drawText("OCR digital", { x: 50, y: 790, size: 16 });
  textPage.drawText(`Confianza estimada: ${confidence ? `${confidence.toFixed(1)}%` : "N/A"}`, { x: 50, y: 770, size: 11 });

  const normalized = ocrText.replace(/\r/g, "").trim() || "No se pudo extraer texto legible en OCR.";
  const lines = normalized.split("\n");
  let y = 745;
  for (const rawLine of lines) {
    if (y < 55) break;
    const line = rawLine.slice(0, 95);
    textPage.drawText(line, { x: 50, y, size: 9 });
    y -= 12;
  }

  return Buffer.from(await pdfDoc.save());
}

async function createPdfFromImageOnly(imageBytes: Buffer) {
  const sharp = await loadSharp();
  const metadata = await sharp(imageBytes).metadata();
  const width = metadata.width ?? 1200;
  const height = metadata.height ?? 1700;

  const pdfDoc = await PDFDocument.create();
  const imagePage = pdfDoc.addPage([width, height]);
  const embedded = await pdfDoc.embedJpg(imageBytes);

  imagePage.drawImage(embedded, {
    x: 0,
    y: 0,
    width,
    height,
  });

  return Buffer.from(await pdfDoc.save());
}

async function getOcrWorker() {
  if (!globalForOcr.workerPromise) {
    globalForOcr.workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      return (await createWorker("eng+spa")) as OcrWorker;
    })();
  }

  return globalForOcr.workerPromise;
}

async function enqueueOcrTask(task: () => Promise<OcrResult>) {
  const previousTask = globalForOcr.queue ?? Promise.resolve();

  const currentTask = previousTask.then(task, task);

  globalForOcr.queue = currentTask.then(
    () => undefined,
    () => undefined,
  );

  return currentTask;
}

async function runOcr(imageBytes: Buffer) {
  return enqueueOcrTask(async () => {
    try {
      const worker = await getOcrWorker();
      const result = await worker.recognize(imageBytes);

      return {
        text: result.data.text || "",
        confidence: result.data.confidence,
      };
    } catch {
      globalForOcr.workerPromise = undefined;
      throw new Error("OCR temporalmente no disponible.");
    }
  });
}

function buildPdfPathFromAssetPath(filePath: string) {
  return buildDerivedPdfKey(filePath);
}

async function enhanceDocumentImage(sourceBytes: Buffer, scanMode: ScanMode) {
  const sharp = await loadSharp();

  const normalizedGray = await sharp(sourceBytes)
    .rotate()
    .grayscale()
    .normalize()
    .toBuffer();

  // Build a soft illumination layer to flatten shadows and uneven light.
  const softLightLayer = await sharp(normalizedGray)
    .blur(scanMode === "clean" ? 20 : 14)
    .toBuffer();

  const softLightOverlay = await sharp(softLightLayer)
    .ensureAlpha(scanMode === "clean" ? 0.65 : 0.48)
    .png()
    .toBuffer();

  let enhanced = await sharp(normalizedGray)
    .composite([{ input: softLightOverlay, blend: "screen" }])
    .modulate({ brightness: scanMode === "clean" ? 1.13 : 1.08, saturation: 0.05 })
    .linear(scanMode === "clean" ? 1.14 : 1.07, scanMode === "clean" ? -12 : -6)
    .sharpen({ sigma: scanMode === "clean" ? 1.04 : 0.92, m1: 0.65, m2: 1.55 })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  const stats = await sharp(enhanced).stats();
  const mean = stats.channels[0]?.mean ?? 160;

  // If result is still dark, apply extra lift to reach scanner-like paper brightness.
  if (mean < (scanMode === "clean" ? 158 : 145)) {
    enhanced = await sharp(enhanced)
      .gamma(scanMode === "clean" ? 1.24 : 1.16)
      .modulate({ brightness: scanMode === "clean" ? 1.12 : 1.08 })
      .linear(scanMode === "clean" ? 1.08 : 1.05, scanMode === "clean" ? -9 : -5)
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
  }

  return enhanced;
}

export async function POST(request: Request) {
  try {
    const sessionUser = await getSessionUser();

    if (!sessionUser?.userId) {
      return NextResponse.json({ ok: false, message: "Debes iniciar sesión para escanear expedientes." }, { status: 401 });
    }

    if (sessionUser.isMember) {
      return NextResponse.json({ ok: false, message: "Tu perfil no tiene permisos para escaneo de expedientes." }, { status: 403 });
    }

    const body = (await request.json()) as {
      cedula?: string;
      assetType?: AssetType;
      documentKey?: string;
      includeOcr?: boolean;
      scanMode?: ScanMode;
    };

    const cedula = sanitizeCedula(body.cedula ?? "");
    const assetType = body.assetType;
    const documentKey = sanitizeSegment(body.documentKey ?? "");
    const includeOcr = body.includeOcr === true;
    const scanMode: ScanMode = body.scanMode === "clean" ? "clean" : "normal";

    if (!cedula || !documentKey || (assetType !== "DOCUMENT" && assetType !== "CONTRACT")) {
      return NextResponse.json({ ok: false, message: "Solicitud de escaneo invalida." }, { status: 400 });
    }

    const profile = await prisma.memberProfile.findUnique({
      where: { cedula },
      include: { assets: true },
    });

    if (!profile) {
      return NextResponse.json({ ok: false, message: "No existe expediente para esa cedula." }, { status: 404 });
    }

    const normal = profile.assets.find(
      (asset: any) => asset.assetType === assetType && asset.documentKey === documentKey && asset.variant === "NORMAL",
    );

    if (!normal) {
      return NextResponse.json({ ok: false, message: "Primero debes subir el documento/contrato normal." }, { status: 400 });
    }

    const sourceBytes = await readAssetObject(normal.filePath);
    const normalExt = path.extname(normal.fileName || normal.filePath).toLowerCase();
    const scannedExt = isImageFile(normal.fileName || normal.filePath, normal.mimeType) ? ".jpg" : normalExt || ".bin";

    let finalFilePath = buildAssetKey({
      cedula,
      assetType,
      documentKey,
      variant: "SCANNED",
      fileName: `scan${scannedExt}`,
      token: randomUUID().slice(0, 8),
    });
    let finalFileName = `scan-${normal.fileName}`;
    let finalMimeType = normal.mimeType || "application/octet-stream";
    let finalSize = normal.size;
    let generatedPdfPath: string | null = null;
    let ocrConfidence: number | null = null;
    let ocrPreview: string | null = null;
    let ocrTextPath: string | null = null;

    if (isImageFile(normal.fileName || normal.filePath, normal.mimeType)) {
      const processedImage = await enhanceDocumentImage(sourceBytes, scanMode);

      await saveAssetObject(finalFilePath, processedImage, "image/jpeg");

      let ocrText = "";
      if (includeOcr) {
        try {
          const ocrResult = await runOcr(processedImage);
          ocrText = ocrResult.text;
          ocrConfidence = ocrResult.confidence ?? null;
          ocrPreview = ocrText.replace(/\s+/g, " ").trim().slice(0, 240);

          const txtKey = buildDerivedTextKey(finalFilePath);
          await saveAssetObject(txtKey, Buffer.from(ocrText || ""), "text/plain; charset=utf-8");
          ocrTextPath = txtKey;
        } catch {
          ocrPreview = "OCR no disponible para este documento.";
        }
      }

      const pdfBytes = includeOcr
        ? await createPdfFromImageAndText(processedImage, ocrText, ocrConfidence ?? undefined)
        : await createPdfFromImageOnly(processedImage);
      const pdfKey = buildDerivedPdfKey(finalFilePath);
      await saveAssetObject(pdfKey, pdfBytes, "application/pdf");

      generatedPdfPath = pdfKey;
      finalFileName = `scan-${path.basename(normal.fileName || "documento")}`;
      finalMimeType = "image/jpeg";
      finalSize = processedImage.length;
    } else if (isPdfFile(normal.fileName || normal.filePath, normal.mimeType)) {
      const pdfDoc = await PDFDocument.load(sourceBytes);
      const normalizedPdf = Buffer.from(await pdfDoc.save());

      await saveAssetObject(finalFilePath, normalizedPdf, "application/pdf");
      generatedPdfPath = finalFilePath;
      finalFileName = `scan-${path.basename(normal.fileName || "documento.pdf")}`;
      finalMimeType = "application/pdf";
      finalSize = normalizedPdf.length;
    } else {
      await saveAssetObject(finalFilePath, sourceBytes, normal.mimeType || "application/octet-stream");

      const fallbackPdfPath = buildPdfPathFromAssetPath(finalFilePath);

      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([595, 842]);
      page.drawText("Documento digitalizado", { x: 50, y: 780, size: 14 });
      page.drawText(`Archivo base: ${normal.fileName}`, { x: 50, y: 750, size: 11 });
      page.drawText(`Cedula: ${cedula}`, { x: 50, y: 730, size: 11 });
      page.drawText("El archivo original fue registrado en el expediente.", { x: 50, y: 710, size: 11 });
      await saveAssetObject(fallbackPdfPath, Buffer.from(await pdfDoc.save()), "application/pdf");
      generatedPdfPath = fallbackPdfPath;
    }

    const asset = await prisma.memberAsset.upsert({
      where: {
        profileId_assetType_documentKey_variant: {
          profileId: profile.id,
          assetType,
          documentKey,
          variant: "SCANNED",
        },
      },
      create: {
        profileId: profile.id,
        assetType,
        documentKey,
        variant: "SCANNED",
        filePath: finalFilePath,
        fileName: finalFileName,
        mimeType: finalMimeType,
        size: finalSize,
      },
      update: {
        filePath: finalFilePath,
        fileName: finalFileName,
        mimeType: finalMimeType,
        size: finalSize,
      },
    });

    return NextResponse.json({
      ok: true,
      message: includeOcr
        ? `Escaneo digital ${scanMode} con OCR generado y registrado.`
        : `Escaneo digital ${scanMode} generado y registrado.`,
      asset,
      pdfPath: generatedPdfPath,
      ocr: {
        confidence: ocrConfidence,
        preview: ocrPreview,
        textPath: ocrTextPath,
      },
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "No se pudo procesar el escaneo digital en este momento.",
      },
      { status: 500 },
    );
  }
}
