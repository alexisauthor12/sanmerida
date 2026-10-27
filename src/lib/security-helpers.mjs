export function normalizeMemberUsername(value) {
  const trimmed = String(value ?? "").trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

export function isBcryptHash(value) {
  return /^\$2[aby]\$(0[4-9]|[12]\d|3[01])\$[./A-Za-z0-9]{53}$/.test(
    String(value ?? "").trim(),
  );
}

/**
 * Enmascara una cedula para poder mostrarla en la auditoria y en los mensajes sin
 * exponer el dato completo: "31033017" -> "***3017".
 *
 * La auditoria NUNCA guarda la cedula completa (ver docs/SEGURIDAD_INTEGRAL.md 6.3).
 */
export function maskCedula(value) {
  const digits = String(value ?? "").replace(/\D/g, "");

  if (!digits) return "—";

  return `***${digits.slice(-4)}`;
}