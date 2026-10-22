/**
 * Define (o rota) la licencia de administrador.
 *
 * Genera el hash bcrypt de la licencia indicada y lo escribe correctamente en
 * `.env.local` y `.dev.vars` (sin barras invertidas escapadas, que es el error
 * que impedía el login de admin).
 *
 * Uso:
 *   node scripts/set-admin-license.mjs "TU-LICENCIA-SEGURA"
 *
 * Después, para producción:
 *   npx wrangler secret put ADMIN_LICENSE_HASH   (pegar el hash que imprime)
 *   o bien: npm run build:cf && npm run deploy:cf
 */
import bcrypt from "bcryptjs";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const license = process.argv[2];

if (!license || license.length < 8) {
  console.error(
    'Uso: node scripts/set-admin-license.mjs "TU-LICENCIA" (mínimo 8 caracteres)'
  );
  process.exit(1);
}

const hash = bcrypt.hashSync(license, 12);

console.log("=================================================");
console.log("  LICENCIA ADMINISTRATIVA ACTUALIZADA");
console.log("=================================================");
console.log(`  Usuario admin : ${process.env.ADMIN_USERNAME ?? "san-root-x9"}`);
console.log(`  Licencia      : ${license}`);
console.log(`  Hash bcrypt   : ${hash}`);
console.log("=================================================");

for (const file of [".env.local", ".dev.vars"]) {
  if (!existsSync(file)) {
    console.warn(`(omitido) ${file} no existe`);
    continue;
  }

  let content = readFileSync(file, "utf8");

  if (/^ADMIN_LICENSE_HASH=.*$/m.test(content)) {
    content = content.replace(
      /^ADMIN_LICENSE_HASH=.*$/m,
      `ADMIN_LICENSE_HASH=${hash}`
    );
  } else {
    content = `${content.trimEnd()}\nADMIN_LICENSE_HASH=${hash}\n`;
  }

  writeFileSync(file, content, "utf8");
  console.log(`Actualizado: ${file}`);
}
