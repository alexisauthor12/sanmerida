import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import {
  buildAssetKey,
  buildDerivedPdfKey,
  MAX_ASSET_UPLOAD_BYTES,
  sanitizeAssetSegment,
  sanitizeCedulaDigits,
  validateAssetUpload,
} from "@/lib/asset-paths.mjs";
import { deleteAssetObject, saveAssetObject } from "@/lib/asset-storage";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";

type AssetType = "DOCUMENT" | "CONTRACT";
type AssetVariant = "NORMAL" | "SCANNED";

/**
 * `sharp` es un modulo nativo: no existe en Cloudflare Workers. Se carga de
 * forma perezosa para que la ruta pueda subir el archivo aunque el procesado
 * de imagen no este disponible en el entorno.
 */
type SharpFactory = typeof import("sharp");

async function loadSharp(): Promise<SharpFactory> {
  const module = await import("sharp");
  return module.default;
}

function sanitizeSegment(value: string) {
  return sanitizeAssetSegment(value);
}

function sanitizeCedula(value: string) {
  return sanitizeCedulaDigits(value);
}

function ensureAllowed(assetType: string, variant: string) {
  return (assetType === "DOCUMENT" || assetType === "CONTRACT") && (variant === "NORMAL" || variant === "SCANNED");
}

function isImageFile(fileName: string, mimeType?: string | null) {
  if (mimeType?.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(fileName);
}

type CropRect = { left: number; top: number; width: number; height: number };
type CandidateRect = CropRect & { confidence: number; source: string };

type DetectionContext = {
  imageWidth: number;
  imageHeight: number;
  analysisWidth: number;
  analysisHeight: number;
  scale: number;
  skinMask: Uint8Array;
  integral: Int32Array;
  luma: Uint8Array;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function computeIntegralImage(binary: Uint8Array, width: number, height: number) {
  const integral = new Int32Array((width + 1) * (height + 1));

  for (let y = 1; y <= height; y += 1) {
    let rowSum = 0;
    for (let x = 1; x <= width; x += 1) {
      rowSum += binary[(y - 1) * width + (x - 1)] || 0;
      integral[y * (width + 1) + x] = integral[(y - 1) * (width + 1) + x] + rowSum;
    }
  }

  return integral;
}

function getRectSum(integral: Int32Array, width: number, left: number, top: number, rectWidth: number, rectHeight: number) {
  const stride = width + 1;
  const x1 = left;
  const y1 = top;
  const x2 = left + rectWidth;
  const y2 = top + rectHeight;

  return (
    integral[y2 * stride + x2]
    - integral[y1 * stride + x2]
    - integral[y2 * stride + x1]
    + integral[y1 * stride + x1]
  );
}

function toAbsoluteRect(ctx: DetectionContext, rect: CropRect): CropRect {
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

function findLargestSkinCluster(ctx: DetectionContext, search: CropRect): CropRect | null {
  const { analysisWidth, analysisHeight, skinMask } = ctx;
  const leftBound = clamp(search.left, 0, analysisWidth - 1);
  const topBound = clamp(search.top, 0, analysisHeight - 1);
  const rightBound = clamp(search.left + search.width, leftBound + 1, analysisWidth);
  const bottomBound = clamp(search.top + search.height, topBound + 1, analysisHeight);
  const visited = new Uint8Array(analysisWidth * analysisHeight);

  let best: { area: number; minX: number; minY: number; maxX: number; maxY: number } | null = null;

  for (let y = topBound; y < bottomBound; y += 1) {
    for (let x = leftBound; x < rightBound; x += 1) {
      const startIdx = y * analysisWidth + x;
      if (visited[startIdx] || !skinMask[startIdx]) continue;

      const queue: number[] = [startIdx];
      visited[startIdx] = 1;

      let area = 0;
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;

      while (queue.length > 0) {
        const idx = queue.pop()!;
        const cx = idx % analysisWidth;
        const cy = Math.floor(idx / analysisWidth);

        area += 1;
        if (cx < minX) minX = cx;
        if (cy < minY) minY = cy;
        if (cx > maxX) maxX = cx;
        if (cy > maxY) maxY = cy;

        const neighbors = [
          idx - 1,
          idx + 1,
          idx - analysisWidth,
          idx + analysisWidth,
          idx - analysisWidth - 1,
          idx - analysisWidth + 1,
          idx + analysisWidth - 1,
          idx + analysisWidth + 1,
        ];

        for (const next of neighbors) {
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

  if (!best || best.area < 450) return null;

  return {
    left: best.minX,
    top: best.minY,
    width: best.maxX - best.minX + 1,
    height: best.maxY - best.minY + 1,
  };
}

function detectFromPortraitCluster(ctx: DetectionContext): CandidateRect | null {
  const search: CropRect = {
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
  const density = getRectSum(ctx.integral, ctx.analysisWidth, left, top, rect.width, rect.height) / Math.max(rect.width * rect.height, 1);

  if (density < 0.11) return null;

  return { ...toAbsoluteRect(ctx, rect), confidence: 0.88 + Math.min(0.08, density), source: "portrait-cluster" };
}

function detectFromCedulaTemplate(ctx: DetectionContext): CandidateRect {
  const rect: CropRect = {
    left: Math.round(ctx.analysisWidth * 0.6),
    top: Math.round(ctx.analysisHeight * 0.26),
    width: Math.round(ctx.analysisWidth * 0.34),
    height: Math.round(ctx.analysisHeight * 0.66),
  };

  const absolute = toAbsoluteRect(ctx, rect);
  return { ...absolute, confidence: 0.74, source: "cedula-template" };
}

function detectBySlidingWindow(ctx: DetectionContext): CandidateRect | null {
  const widthCandidates = [0.2, 0.24, 0.28, 0.32].map((ratio) => Math.round(ctx.analysisWidth * ratio));
  let best: { score: number; rect: CropRect } | null = null;

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
        const score = (skinDensity * 0.5) + (xBias * 0.3) + (yBias * 0.2);

        if (!best || score > best.score) {
          best = { score, rect: { left, top, width, height } };
        }
      }
    }
  }

  if (!best || best.score < 0.26) return null;

  const expanded: CropRect = {
    left: clamp(best.rect.left - Math.round(best.rect.width * 0.2), Math.round(ctx.analysisWidth * 0.5), ctx.analysisWidth - 1),
    top: clamp(best.rect.top - Math.round(best.rect.height * 0.34), 0, ctx.analysisHeight - 1),
    width: clamp(best.rect.width + Math.round(best.rect.width * 0.42), 80, ctx.analysisWidth),
    height: clamp(best.rect.height + Math.round(best.rect.height * 0.46), 100, ctx.analysisHeight),
  };

  const right = clamp(expanded.left + expanded.width, expanded.left + 1, ctx.analysisWidth);
  const bottom = clamp(expanded.top + expanded.height, expanded.top + 1, ctx.analysisHeight);

  return {
    ...toAbsoluteRect(ctx, { left: expanded.left, top: expanded.top, width: right - expanded.left, height: bottom - expanded.top }),
    confidence: 0.6 + Math.min(0.22, best.score),
    source: "sliding-window",
  };
}

function scoreCandidate(candidate: CandidateRect, imageWidth: number, imageHeight: number) {
  const centerX = candidate.left + candidate.width / 2;
  const centerY = candidate.top + candidate.height / 2;
  const xBias = 1 - Math.min(1, Math.abs(centerX - imageWidth * 0.77) / (imageWidth * 0.45));
  const yBias = 1 - Math.min(1, Math.abs(centerY - imageHeight * 0.61) / (imageHeight * 0.48));
  const expectedArea = imageWidth * imageHeight * 0.18;
  const area = candidate.width * candidate.height;
  const areaScore = 1 - Math.min(1, Math.abs(area - expectedArea) / expectedArea);
  return candidate.confidence * 0.55 + xBias * 0.2 + yBias * 0.15 + areaScore * 0.1;
}

function scoreFacialBandsAndSymmetry(candidate: CandidateRect, ctx: DetectionContext) {
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
  let symmetryDelta = 0;
  let samples = 0;

  for (let x = left; x < right; x += 1) {
    const eye = ctx.luma[eyeY * ctx.analysisWidth + x] ?? 0;
    const mouth = ctx.luma[mouthY * ctx.analysisWidth + x] ?? 0;
    const forehead = ctx.luma[foreheadY * ctx.analysisWidth + x] ?? 0;

    eyeDarkness += 255 - eye;
    mouthDarkness += 255 - mouth;
    foreheadLightness += forehead;
  }

  const half = Math.floor(width / 2);
  for (let y = top; y < bottom; y += 2) {
    for (let x = 0; x < half; x += 1) {
      const lx = left + x;
      const rx = right - 1 - x;
      const l = ctx.luma[y * ctx.analysisWidth + lx] ?? 0;
      const r = ctx.luma[y * ctx.analysisWidth + rx] ?? 0;
      symmetryDelta += Math.abs(l - r);
      samples += 1;
    }
  }

  const eyeScore = eyeDarkness / Math.max(width, 1);
  const mouthScore = mouthDarkness / Math.max(width, 1);
  const foreheadScore = foreheadLightness / Math.max(width, 1);
  const symmetryScore = 1 - Math.min(1, (symmetryDelta / Math.max(samples, 1)) / 64);

  const bandSignal = clamp(((eyeScore * 0.45) + (mouthScore * 0.35) + (foreheadScore * 0.2)) / 255, 0, 1);
  return (symmetryScore * 0.55) + (bandSignal * 0.45);
}

async function detectFaceCropFromCedula(sourceBytes: Buffer): Promise<CropRect | null> {
  const sharp = await loadSharp();
  const normalized = sharp(sourceBytes).rotate();
  const metadata = await normalized.metadata();

  if (!metadata.width || !metadata.height) return null;

  const maxAnalysisWidth = 1200;
  const scale = metadata.width > maxAnalysisWidth ? maxAnalysisWidth / metadata.width : 1;
  const analysisWidth = Math.max(320, Math.round(metadata.width * scale));
  const analysisHeight = Math.max(220, Math.round(metadata.height * scale));

  const raw = await normalized
    .resize(analysisWidth, analysisHeight, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();

  const skinMask = new Uint8Array(analysisWidth * analysisHeight);
  const luma = new Uint8Array(analysisWidth * analysisHeight);

  for (let i = 0, p = 0; i < skinMask.length; i += 1, p += 3) {
    const r = raw[p] || 0;
    const g = raw[p + 1] || 0;
    const b = raw[p + 2] || 0;
    luma[i] = Math.round((r * 299 + g * 587 + b * 114) / 1000);

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);

    const isSkin = (
      r > 80
      && g > 40
      && b > 20
      && max - min > 12
      && Math.abs(r - g) > 8
      && r > g
      && r > b
    );

    skinMask[i] = isSkin ? 1 : 0;
  }

  const integral = computeIntegralImage(skinMask, analysisWidth, analysisHeight);

  const ctx: DetectionContext = {
    imageWidth: metadata.width,
    imageHeight: metadata.height,
    analysisWidth,
    analysisHeight,
    scale,
    skinMask,
    integral,
    luma,
  };

  const candidates: CandidateRect[] = [];

  const portraitCluster = detectFromPortraitCluster(ctx);
  if (portraitCluster) candidates.push(portraitCluster);

  const slidingWindow = detectBySlidingWindow(ctx);
  if (slidingWindow) candidates.push(slidingWindow);

  candidates.push(detectFromCedulaTemplate(ctx));

  if (candidates.length === 0) return null;

  let best: CandidateRect | null = null;
  let bestScore = -1;

  for (const candidate of candidates) {
    const facialBandScore = scoreFacialBandsAndSymmetry(candidate, ctx);
    const score = (scoreCandidate(candidate, metadata.width, metadata.height) * 0.8) + (facialBandScore * 0.2);
    if (!best || score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  if (!best) return null;

  return {
    left: clamp(best.left, 0, metadata.width - 1),
    top: clamp(best.top, 0, metadata.height - 1),
    width: clamp(best.width, 80, metadata.width),
    height: clamp(best.height, 100, metadata.height),
  };
}

async function tryBuildAutoSelfie(sourceBytes: Buffer) {
  const crop = await detectFaceCropFromCedula(sourceBytes);
  if (!crop) return null;

  const sharp = await loadSharp();

  return sharp(sourceBytes)
    .rotate()
    .extract(crop)
    .resize(760, 980, { fit: "inside", withoutEnlargement: true })
    .modulate({ brightness: 1.01, saturation: 1.03 })
    .sharpen(0.35)
    .jpeg({ quality: 94, mozjpeg: true })
    .toBuffer();
}

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();

  if (!sessionUser?.userId) {
    return NextResponse.json({ ok: false, message: "Debes iniciar sesión para cargar archivos." }, { status: 401 });
  }

  if (sessionUser.isMember) {
    return NextResponse.json({ ok: false, message: "Tu perfil no tiene permisos para cargar expedientes." }, { status: 403 });
  }

  const form = await request.formData();

  const cedula = sanitizeCedula(String(form.get("cedula") ?? ""));
  const assetType = String(form.get("assetType") ?? "") as AssetType;
  const documentKey = sanitizeSegment(String(form.get("documentKey") ?? ""));
  const variant = String(form.get("variant") ?? "") as AssetVariant;
  const file = form.get("file");

  if (!cedula || !documentKey || !file || !(file instanceof File) || !ensureAllowed(assetType, variant)) {
    return NextResponse.json({ ok: false, message: "Parametros de carga incompletos o invalidos." }, { status: 400 });
  }

  // Blindaje: solo imagenes/PDF dentro del tamano permitido.
  const validation = validateAssetUpload({ fileName: file.name, mimeType: file.type, size: file.size });

  if (!validation.ok) {
    return NextResponse.json({ ok: false, message: validation.message }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  let fileKey: string;

  try {
    fileKey = await saveAssetObject(
      buildAssetKey({
        cedula,
        assetType,
        documentKey,
        variant,
        fileName: file.name || "",
        token: randomUUID().slice(0, 8),
      }),
      bytes,
      file.type || "application/octet-stream",
    );
  } catch (error) {
    // El almacenamiento tambien valida tipo/tamano: se responde claro, sin 500.
    console.error("member-files/upload storage error", error);

    return NextResponse.json(
      {
        ok: false,
        message: "No se pudo guardar el archivo. Verifica el formato y el tamaño (máximo 20 MB).",
      },
      { status: 400 },
    );
  }

  const profile = await prisma.memberProfile.upsert({
    where: { cedula },
    create: { cedula },
    update: {},
  });

  // Al reemplazar un archivo hay que borrar el anterior para no dejar huerfanos
  // en el almacenamiento (antes solo se sobreescribia la ruta en la BD).
  const previousAsset = await prisma.memberAsset.findUnique({
    where: {
      profileId_assetType_documentKey_variant: {
        profileId: profile.id,
        assetType,
        documentKey,
        variant,
      },
    },
    select: { filePath: true },
  });

  const asset = await prisma.memberAsset.upsert({
    where: {
      profileId_assetType_documentKey_variant: {
        profileId: profile.id,
        assetType,
        documentKey,
        variant,
      },
    },
    create: {
      profileId: profile.id,
      assetType,
      documentKey,
      variant,
      filePath: fileKey,
      fileName: file.name || fileKey.split("/").pop() || fileKey,
      mimeType: file.type || "application/octet-stream",
      size: bytes.length,
    },
    update: {
      filePath: fileKey,
      fileName: file.name || fileKey.split("/").pop() || fileKey,
      mimeType: file.type || "application/octet-stream",
      size: bytes.length,
    },
  });

  if (previousAsset?.filePath && previousAsset.filePath !== fileKey) {
    await deleteAssetObject(previousAsset.filePath);
    await deleteAssetObject(buildDerivedPdfKey(previousAsset.filePath));
  }

  // El navegador escanea el documento y puede enviar ya el PDF digital generado.
  const pdfPart = form.get("pdf");
  let pdfKey: string | null = null;

  if (variant === "SCANNED" && pdfPart instanceof File && pdfPart.size > 0) {
    const pdfBytes = Buffer.from(await pdfPart.arrayBuffer());

    if (pdfBytes.length > MAX_ASSET_UPLOAD_BYTES) {
      return NextResponse.json({ ok: false, message: "El PDF digital supera el tamaño permitido." }, { status: 400 });
    }

    pdfKey = await saveAssetObject(buildDerivedPdfKey(fileKey), pdfBytes, "application/pdf");
  }

  let autoSelfie:
    | {
        fileName: string;
        filePath: string;
        mimeType: string;
      }
    | undefined;

  const shouldAttemptAutoSelfie =
    assetType === "DOCUMENT" &&
    documentKey === "identidad" &&
    variant === "NORMAL" &&
    isImageFile(file.name || fileKey, file.type);

  if (shouldAttemptAutoSelfie) {
    try {
      const selfieBytes = await tryBuildAutoSelfie(bytes);

      if (selfieBytes) {
        const selfieFilePath = await saveAssetObject(
          buildAssetKey({
            cedula,
            assetType: "DOCUMENT",
            documentKey: "selfie",
            variant: "NORMAL",
            fileName: "selfie-extraida-cedula.jpg",
            token: randomUUID().slice(0, 8),
          }),
          selfieBytes,
          "image/jpeg",
        );

        const previousSelfie = await prisma.memberAsset.findUnique({
          where: {
            profileId_assetType_documentKey_variant: {
              profileId: profile.id,
              assetType: "DOCUMENT",
              documentKey: "selfie",
              variant: "NORMAL",
            },
          },
          select: { filePath: true },
        });

        const selfieAsset = await prisma.memberAsset.upsert({
          where: {
            profileId_assetType_documentKey_variant: {
              profileId: profile.id,
              assetType: "DOCUMENT",
              documentKey: "selfie",
              variant: "NORMAL",
            },
          },
          create: {
            profileId: profile.id,
            assetType: "DOCUMENT",
            documentKey: "selfie",
            variant: "NORMAL",
            filePath: selfieFilePath,
            fileName: "selfie-extraida-cedula.jpg",
            mimeType: "image/jpeg",
            size: selfieBytes.length,
          },
          update: {
            filePath: selfieFilePath,
            fileName: "selfie-extraida-cedula.jpg",
            mimeType: "image/jpeg",
            size: selfieBytes.length,
          },
        });

        autoSelfie = {
          fileName: selfieAsset.fileName,
          filePath: selfieAsset.filePath,
          mimeType: selfieAsset.mimeType || "image/jpeg",
        };

        if (previousSelfie?.filePath && previousSelfie.filePath !== selfieFilePath) {
          await deleteAssetObject(previousSelfie.filePath);
          await deleteAssetObject(buildDerivedPdfKey(previousSelfie.filePath));
        }
      }
    } catch {
      // Keep upload successful even if auto selfie extraction is not possible for this image.
    }
  }

  return NextResponse.json({
    ok: true,
    message: `${assetType} ${documentKey} ${variant.toLowerCase()} cargado correctamente.`,
    asset,
    autoSelfie,
    pdfPath: pdfKey,
  });
}

export async function DELETE(request: Request) {
  const sessionUser = await getSessionUser();

  if (!sessionUser?.userId) {
    return NextResponse.json({ ok: false, message: "Debes iniciar sesión para eliminar archivos." }, { status: 401 });
  }

  if (sessionUser.isMember) {
    return NextResponse.json({ ok: false, message: "Tu perfil no tiene permisos para eliminar archivos." }, { status: 403 });
  }

  let payload: {
    cedula?: string;
    assetType?: AssetType;
    documentKey?: string;
    variant?: AssetVariant;
  };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ ok: false, message: "Solicitud invalida." }, { status: 400 });
  }

  const cedula = sanitizeCedula(String(payload.cedula ?? ""));
  const assetType = String(payload.assetType ?? "") as AssetType;
  const documentKey = sanitizeSegment(String(payload.documentKey ?? ""));
  const variant = String(payload.variant ?? "") as AssetVariant;

  if (!cedula || !documentKey || !ensureAllowed(assetType, variant)) {
    return NextResponse.json({ ok: false, message: "Parametros incompletos para eliminar el archivo." }, { status: 400 });
  }

  const profile = await prisma.memberProfile.findUnique({ where: { cedula } });
  if (!profile) {
    return NextResponse.json({ ok: true, message: "No existe expediente para la cedula indicada." });
  }

  const existing = await prisma.memberAsset.findUnique({
    where: {
      profileId_assetType_documentKey_variant: {
        profileId: profile.id,
        assetType,
        documentKey,
        variant,
      },
    },
  });

  if (!existing) {
    return NextResponse.json({ ok: true, message: "El archivo ya no estaba registrado." });
  }

  // Primero se retira el archivo del almacenamiento (a la papelera, recuperable).
  // Solo si eso funciona se borra la fila: asi la base de datos nunca queda
  // apuntando a un archivo que sigue ahi, ni se pierde la referencia si falla.
  const movedToTrash = await deleteAssetObject(existing.filePath);
  await deleteAssetObject(buildDerivedPdfKey(existing.filePath));

  if (!movedToTrash) {
    return NextResponse.json(
      {
        ok: false,
        message: "No se pudo retirar el archivo del almacenamiento. Intenta de nuevo.",
      },
      { status: 502 },
    );
  }

  await prisma.memberAsset.delete({ where: { id: existing.id } });

  return NextResponse.json({
    ok: true,
    message: `${assetType} ${documentKey} ${variant.toLowerCase()} eliminado correctamente.`,
  });
}
