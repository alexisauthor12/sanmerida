/**
 * Patch para Windows: OpenNext transforma el package.json de los paquetes con
 * condición "workerd" (p. ej. `.prisma/client`) para que el Worker use el motor
 * WASM en lugar del runtime de Node. En Windows el nombre de paquete capturado
 * usa backslashes (".prisma\\client") y NO coincide con serverExternalPackages
 * (".prisma/client"), así que el transform se saltaba y Prisma fallaba en
 * producción con: "[unenv] fs.readFileSync is not implemented yet!".
 *
 * Este script normaliza los separadores para que el match funcione.
 * Es idempotente y se ejecuta en `postinstall`.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const file =
  "node_modules/@opennextjs/cloudflare/dist/cli/build/utils/workerd.js";

if (!existsSync(file)) {
  console.warn(
    "[patch-opennext-workerd] @opennextjs/cloudflare no encontrado (se omite)."
  );
  process.exit(0);
}

let source = readFileSync(file, "utf8");

if (source.includes("matchedPkg")) {
  console.log("[patch-opennext-workerd] Ya estaba aplicado.");
  process.exit(0);
}

const target = `            const match = src.match(isNodeModuleRegex);
            if (match?.groups?.pkg && externalPackages.includes(match.groups.pkg) && hasBuildCondition) {`;

const replacement = `            const match = src.match(isNodeModuleRegex);
            const matchedPkg = match?.groups?.pkg?.replace(/\\\\/g, "/");
            if (matchedPkg && externalPackages.includes(matchedPkg) && hasBuildCondition) {`;

if (!source.includes(target)) {
  console.warn(
    "[patch-opennext-workerd] Patrón no encontrado (¿cambió la versión?). Se omite."
  );
  process.exit(0);
}

source = source.replace(target, replacement);
writeFileSync(file, source, "utf8");
console.log(
  "[patch-opennext-workerd] Patch de Windows aplicado a @opennextjs/cloudflare."
);
