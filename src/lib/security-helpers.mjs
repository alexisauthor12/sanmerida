export function normalizeMemberUsername(value) {
  const trimmed = String(value ?? "").trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

export function isBcryptHash(value) {
  return /^\$2[aby]\$/.test(String(value ?? "").trim());
}
