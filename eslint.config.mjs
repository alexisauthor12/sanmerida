import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Reglas de React Compiler que llegan con eslint-config-next 16.4.3 y que el
    // proyecto hereda en modo ERROR. Los patrones que marcan son anteriores a la
    // actualizacion y son legitimos:
    //   - `react-hooks/refs`: ref "latest" para mantener callbacks estables
    //     (patron recomendado por la propia documentacion de React).
    //   - `react-hooks/set-state-in-effect`: carga inicial en un efecto.
    //   - `react-hooks/immutability` y `react-hooks/purity`: navegacion con
    //     window.location y uso de Date.now en un callback.
    // Se dejan como AVISO para no ocultarlos (se ven en cada `npm run lint`) y se
    // resuelven en una tarea aparte de refactor. No son agujeros de seguridad.
    rules: {
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
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
