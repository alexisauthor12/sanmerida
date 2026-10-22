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