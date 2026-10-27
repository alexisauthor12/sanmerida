import { NextResponse } from "next/server";
import {
  extractMemberCedulaFromKey,
  guessContentTypeFromKey,
  isServableAssetKey,
  normalizeStorageKey,
} from "@/lib/asset-paths.mjs";
import { requireExpedienteAccess } from "@/lib/api-guard";
import { readAssetObject } from "@/lib/asset-storage";
import { labelExpediente, recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
// Sin cache de ruta: cada lectura debe ir al almacenamiento real.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Entrega un archivo de expediente.
 *
 * Los documentos de los miembros ya no se sirven como archivos estaticos de
 * `public/uploads`: se leen desde el almacenamiento (Supabase Storage o disco)
 * y solo se entregan a:
 *  - personal autenticado (no miembro), o
 *  - el miembro dueño del expediente indicado en la clave.
 *
 * Uso: GET /api/member-files/file?path=uploads/members/<cedula>/...
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = normalizeStorageKey(searchParams.get("path") ?? "");
    const cedula = extractMemberCedulaFromKey(key);

    // `isServableAssetKey` valida forma + extension permitida + que no sea
    // papelera: solo se pueden pedir documentos de expediente.
    if (!key || !cedula || !isServableAssetKey(key)) {
      return NextResponse.json(
        { ok: false, message: "Archivo de expediente no válido." },
        { status: 400 },
      );
    }

    // Un miembro solo accede a su propio expediente; ADMIN (con
    // `documento:read:any`) accede a cualquiera. Si no esta autorizado se responde
    // 404 uniforme, sin confirmar que el documento existe.
    const access = await requireExpedienteAccess(cedula, {
      request,
      anyPermission: "documento:read:any",
      ownPermission: "documento:read:own",
    });

    if (!access.ok) {
      return access.response;
    }

    // El documento se sirve solo si sigue registrado en el expediente. Asi,
    // despues de borrarlo la respuesta es 404 de inmediato (sin depender de
    // cuanto tarde el almacenamiento en propagar el borrado) y nunca se entrega
    // un archivo que no pertenece a ningun expediente activo.
    const asset = await prisma.memberAsset.findFirst({
      where: { filePath: { in: [key, `/${key}`] } },
      select: { id: true },
    });

    const derivedBaseKey = key.endsWith(".pdf") || key.endsWith(".txt")
      ? key.replace(/\.[a-z0-9]{1,8}$/i, "")
      : "";

    const knownAsset =
      asset ??
      (derivedBaseKey
        ? await prisma.memberAsset.findFirst({
            where: { filePath: { startsWith: derivedBaseKey } },
            select: { id: true },
          })
        : null);

    if (!knownAsset) {
      return NextResponse.json(
        { ok: false, message: "El documento ya no está disponible en el expediente." },
        { status: 404 },
      );
    }

    const bytes = await readAssetObject(key);
    const fileName = key.split("/").pop() || "archivo";

    // Queda registrado quien descargo que documento, desde que IP y cuando.
    await recordAudit({
      action: "DOCUMENTO_READ",
      actor: {
        userId: access.user.userId,
        email: access.user.email,
        role: access.user.role,
      },
      targetType: "MemberAsset",
      targetId: knownAsset.id,
      targetLabel: labelExpediente(cedula),
      metadata: { archivo: fileName },
      request,
    });

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": guessContentTypeFromKey(key),
        "Content-Length": String(bytes.length),
        "Content-Disposition": `inline; filename="${fileName}"`,
        // `no-store`: un documento borrado o reemplazado no debe servirse nunca
        // desde la cache del navegador o del proxy.
        "Cache-Control": "no-store, private",
        // Blindaje del navegador: nunca interpretar el contenido como otra cosa.
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      },
    });
  } catch (error) {
    console.error("member-files/file error", error);

    return NextResponse.json(
      { ok: false, message: "No se pudo leer el archivo del expediente." },
      { status: 404 },
    );
  }
}
