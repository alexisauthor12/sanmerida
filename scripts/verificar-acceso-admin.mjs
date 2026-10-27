/**
 * Comprueba que el acceso de administrador funciona de punta a punta contra un entorno.
 *
 * Los tres pasos, que son los mismos que hace la pantalla:
 *
 *   1. `POST /api/auth/login`          correo + contrasena      -> 200 y cookie de sesion
 *   2. `POST /api/auth/admin-license`  usuario + licencia       -> 200 (step-up)
 *   3. `GET  /api/auditoria`           ruta solo-ADMIN          -> 200
 *
 * Si el paso 3 responde 200, la entrada funciona de verdad: no basta con que el login
 * diga "ok", hay que llegar al panel.
 *
 * Uso:
 *   node scripts/verificar-acceso-admin.mjs <correo> <contrasena> <usuario> <licencia>
 *   node scripts/verificar-acceso-admin.mjs <correo> <contrasena> <usuario> <licencia> https://otro-dominio
 */
const BASE = (process.argv[6] ?? "https://sanmeridajz.com").replace(/\/+$/, "");

const [EMAIL, PASSWORD, USUARIO, LICENCIA] = process.argv.slice(2, 6);

if (!EMAIL || !PASSWORD || !USUARIO || !LICENCIA) {
  console.error(
    "Uso: node scripts/verificar-acceso-admin.mjs <correo> <contrasena> <usuario> <licencia> [url]",
  );
  process.exit(1);
}

/** Las cookies que devuelve una respuesta, en formato de cabecera `Cookie`. */
function cookiesDe(respuesta) {
  return (respuesta.headers.getSetCookie?.() ?? []).map((linea) => linea.split(";")[0]).join("; ");
}

const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD, portal: "account" }),
});

const cuerpoLogin = await login.json().catch(() => ({}));
const cookies = cookiesDe(login);

console.log(`1) login          ${login.status}  ${JSON.stringify(cuerpoLogin).slice(0, 80)}`);

if (login.status !== 200) {
  console.log("\nFALLO en el login: revisa el correo y la contrasena.\n");
  process.exit(1);
}

const licencia = await fetch(`${BASE}/api/auth/admin-license`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: cookies },
  body: JSON.stringify({ username: USUARIO, license: LICENCIA }),
});

const cuerpoLicencia = await licencia.json().catch(() => ({}));

console.log(`2) licencia       ${licencia.status}  ${JSON.stringify(cuerpoLicencia).slice(0, 80)}`);

if (licencia.status !== 200) {
  console.log("\nFALLO en la licencia: revisa el usuario admin y la licencia.\n");
  process.exit(1);
}

const cookiesFinales = [cookies, cookiesDe(licencia)].filter(Boolean).join("; ");

const auditoria = await fetch(`${BASE}/api/auditoria?limite=5`, {
  headers: { cookie: cookiesFinales },
});

const cuerpoAuditoria = await auditoria.json().catch(() => ({}));

console.log(`3) /api/auditoria ${auditoria.status}  ${JSON.stringify(cuerpoAuditoria).slice(0, 80)}`);
console.log(
  auditoria.status === 200
    ? "\nTODO OK: el acceso de administrador funciona de punta a punta.\n"
    : "\nFALLO: la sesion de admin no llega al panel.\n",
);

process.exitCode = auditoria.status === 200 ? 0 : 1;
