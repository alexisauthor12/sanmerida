import { findRecoveryCodeIndex, verifyTotpCode } from "@/lib/totp.mjs";
import { prisma } from "@/lib/prisma";

/**
 * Segundo factor (TOTP) del lado del servidor.
 *
 * Logica que comparten el login y el step-up de la licencia administrativa
 * (`docs/SEGURIDAD_INTEGRAL.md` 12.2). El modulo puro (`totp.mjs`) calcula y
 * verifica; aqui vive lo que necesita base de datos: consumir los codigos de
 * recuperacion.
 */

/** Campos de la cuenta que hacen falta para validar el segundo factor. */
export type TotpAccount = {
  id: string;
  totpEnabled: boolean;
  totpSecret: string | null;
  totpRecoveryCodes: unknown;
};

export type SecondFactorResult =
  | { ok: true; viaRecovery: boolean }
  | { ok: false; reason: "missing" | "invalid" | "not_configured" };

/** Campos que hay que pedir a Prisma para poder validar el segundo factor. */
export const TOTP_SELECT = {
  id: true,
  email: true,
  totpEnabled: true,
  totpSecret: true,
  totpRecoveryCodes: true,
} as const;

/**
 * Mensaje unico de fallo: no distingue entre codigo ausente, incorrecto o cuenta
 * mal configurada. Igual que en el login, el error no da pistas.
 */
export const SECOND_FACTOR_MESSAGE = "Código de verificación incorrecto o vencido.";

/** True si la cuenta exige segundo factor. */
export function requiresSecondFactor(account: TotpAccount | null | undefined): boolean {
  return Boolean(account?.totpEnabled);
}

function leerCodigosDeRecuperacion(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];

  return valor.filter((item): item is string => typeof item === "string");
}

/**
 * Valida el segundo factor de una cuenta.
 *
 * Acepta un codigo TOTP de la app autenticadora o uno de los codigos de
 * recuperacion de un solo uso. Cuando se usa uno de recuperacion, se elimina de
 * la lista en la misma operacion: no se puede reutilizar.
 *
 * Fail-closed: si la cuenta exige 2FA pero no hay secreto guardado, deniega.
 */
export async function checkSecondFactor(
  account: TotpAccount | null | undefined,
  code: unknown,
): Promise<SecondFactorResult> {
  if (!requiresSecondFactor(account)) {
    return { ok: true, viaRecovery: false };
  }

  const cuenta = account as TotpAccount;
  const codigo = String(code ?? "").trim();

  if (!codigo) return { ok: false, reason: "missing" };

  if (!cuenta.totpSecret) return { ok: false, reason: "not_configured" };

  if (await verifyTotpCode(cuenta.totpSecret, codigo)) {
    return { ok: true, viaRecovery: false };
  }

  const hashes = leerCodigosDeRecuperacion(cuenta.totpRecoveryCodes);
  const indice = await findRecoveryCodeIndex(codigo, hashes);

  if (indice < 0) return { ok: false, reason: "invalid" };

  await prisma.user.update({
    where: { id: cuenta.id },
    data: { totpRecoveryCodes: hashes.filter((_, posicion) => posicion !== indice) },
  });

  return { ok: true, viaRecovery: true };
}
