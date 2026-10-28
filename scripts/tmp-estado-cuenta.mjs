/** TEMPORAL: la cuenta volvio a su estado normal. */
import { config as loadEnv } from "dotenv";
import { Client } from "pg";
import { dbSslFor } from "../src/lib/db-ssl.mjs";

loadEnv({ path: [".env.local", ".env"] });

const db = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: dbSslFor(process.env.DATABASE_URL),
});

await db.connect();

const { rows } = await db.query(
  `SELECT "email", "role", "totpEnabled", "totpSecret" IS NULL AS sin_secreto,
          "totpRecoveryCodes" IS NULL AS sin_codigos
     FROM "User" WHERE lower("email") = $1`,
  ["sanmeridaadmin@gmail.com"],
);

await db.end();

const u = rows[0];

console.log(`1) 2FA activo:        ${u.totpEnabled ? "SI <<<< FALLO" : "no"}`);
console.log(`2) secreto borrado:   ${u.sin_secreto ? "si" : "NO <<<< FALLO"}`);
console.log(`3) codigos borrados:  ${u.sin_codigos ? "si" : "NO <<<< FALLO"}`);
console.log(`4) rol:               ${u.role}`);

const login = await fetch("https://sanmeridajz.com/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: "sanmeridaadmin@gmail.com",
    password: process.argv[2],
    portal: "account",
  }),
});

console.log(`5) login sin codigo:  ${login.status}`);
