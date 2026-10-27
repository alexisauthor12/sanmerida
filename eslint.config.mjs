import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Salida generada por el build de Cloudflare/OpenNext: no es codigo fuente
    // (antes se linteaba y hacia que `npm run lint` tardara minutos).
    ".open-next/**",
    ".wrangler/**",
    // Respaldos locales y videos originales: no se versionan ni se lintean.
    "backups/**",
    "storage-videos/**",
    // Edge Functions de Supabase (Deno): ya estan excluidas del tsconfig de Next.
    "supabase/functions/**",
  ]),
]);

export default eslintConfig;
