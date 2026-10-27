import type { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { extractClientIp, extractUserAgent, sanitizeMetadata } from "@/lib/request-info.mjs";
import { maskCedula } from "@/lib/security-helpers.mjs";

/**
 * Auditoria de accesos y cambios (`docs/SEGURIDAD_INTEGRAL.md` seccion 6).
 *
 * Reglas que se cumplen aqui:
 *  - Nunca se guardan datos sensibles en claro (se filtran por `sanitizeMetadata`
 *    y la cedula se enmascara).
 *  - Se registra tanto el exito como la denegacion.
 *  - La escritura es **best-effort**: si falla, la operacion principal NO se rompe
 *    (solo se reporta al log del servidor). Asi la auditoria nunca tumba el
 *    servicio, ni siquiera antes de aplicar el esquema nuevo.
 */

export type AuditActor = {
  userId?: string | null;
  email?: string | null;
  role?: string | null;
};

export type AuditEntry = {
  action: AuditAction;
  actor?: AuditActor | null;
  /** "MemberProfile" | "MemberAsset" | "InstallmentPayment" | "NewsPost" | "User" */
  targetType?: string | null;
  targetId?: string | null;
  /** Etiqueta legible; para expedientes usa `labelExpediente()` (enmascarada). */
  targetLabel?: string | null;
  metadata?: Record<string, unknown>;
  success?: boolean;
  request?: Request;
};

/** Construye el actor de auditoria a partir del usuario de la sesion. */
export function actorFromSession(
  user: { userId?: string; email?: string; role?: string } | null | undefined,
): AuditActor {
  return {
    userId: user?.userId ?? null,
    email: user?.email ?? null,
    role: user?.role ?? null,
  };
}

/** Etiqueta enmascarada de un expediente, lista para la auditoria. */
export function labelExpediente(cedula: string | null | undefined): string {
  return maskCedula(cedula);
}

/** Registra una accion en la auditoria (best-effort). */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const getHeader = entry.request
      ? (nombre: string) => entry.request?.headers.get(nombre) ?? null
      : null;

    await prisma.auditLog.create({
      data: {
        action: entry.action,
        actorUserId: entry.actor?.userId ?? null,
        actorEmail: entry.actor?.email ?? null,
        actorRole: entry.actor?.role ?? null,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        targetLabel: entry.targetLabel ?? null,
        metadata: sanitizeMetadata(entry.metadata) ?? undefined,
        ip: extractClientIp(getHeader) || null,
        userAgent: extractUserAgent(getHeader) || null,
        success: entry.success !== false,
      },
    });
  } catch (error) {
    // Best-effort: la operacion principal no se interrumpe por la auditoria.
    console.error("[audit] No se pudo registrar la accion", entry.action, error);
  }
}
