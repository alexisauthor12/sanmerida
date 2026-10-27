import { isBcryptHash } from "@/lib/security-helpers.mjs";

type RequiredName = "ADMIN_USERNAME" | "ADMIN_ACCOUNT_EMAIL";

function normalizeEnvValue(value?: string) {
  return value?.trim().replace(/^['"]|['"]$/g, "") ?? "";
}

function getRequiredEnv(name: RequiredName) {
  const value = normalizeEnvValue(process.env[name]);

  if (!value) {
    if (process.env.NODE_ENV !== "production") {
      if (name === "ADMIN_USERNAME") return "san-root-x9";
      if (name === "ADMIN_ACCOUNT_EMAIL") return "admin@sanmeridajz.com";
    }

    throw new Error(`${name} no está configurado.`);
  }

  return value;
}

function resolveLicenseConfig() {
  const licenseHash = normalizeEnvValue(process.env.ADMIN_LICENSE_HASH);

  if (licenseHash) {
    if (!isBcryptHash(licenseHash)) {
      throw new Error("ADMIN_LICENSE_HASH no tiene formato bcrypt válido.");
    }

    return { mode: "hash" as const, value: licenseHash };
  }

  if (process.env.NODE_ENV !== "production") {
    const plainLicense = normalizeEnvValue(process.env.ADMIN_LICENSE ?? process.env.ADMIN_LICENSE_PLAIN);

    if (plainLicense) {
      return { mode: "plain" as const, value: plainLicense };
    }
  }

  throw new Error("Falta ADMIN_LICENSE_HASH en configuración administrativa.");
}

export function getAdminSecurityConfig() {
  return {
    username: getRequiredEnv("ADMIN_USERNAME"),
    accountEmail: getRequiredEnv("ADMIN_ACCOUNT_EMAIL").toLowerCase(),
    licenseConfig: resolveLicenseConfig(),
  };
}
