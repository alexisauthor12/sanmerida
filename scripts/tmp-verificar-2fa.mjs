/**
 * TEMPORAL: verificar el despliegue del cambio de 2FA.
 *
 * Dos comprobaciones:
 *   1. que el flujo normal (sin 2FA) sigue entrando igual que antes — es el riesgo
 *      real de haber tocado el token de sesion;
 *   2. que la portada sigue en pie.
 */
const BASE = "https://sanmeridajz.com";

const [EMAIL, PASSWORD, USUARIO, LICENCIA] = process.argv.slice(2, 6);

const cookiesDe = (r) => (r.headers.getSetCookie?.() ?? []).map((l) => l.split(";")[0]).join("; ");

console.log(`1) portada                 ${(await fetch(BASE)).status}`);

const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD, portal: "account" }),
});

const cookies = cookiesDe(login);

console.log(`2) login                   ${login.status}`);

const lic = await fetch(`${BASE}/api/auth/admin-license`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: cookies },
  body: JSON.stringify({ username: USUARIO, license: LICENCIA }),
});

const todas = [cookies, cookiesDe(lic)].filter(Boolean).join("; ");

console.log(`3) licencia                ${lic.status}`);

const diag = await fetch(`${BASE}/api/salud/bindings`, { headers: { cookie: todas } });
const d = await diag.json().catch(() => ({}));

console.log(`4) diagnostico             ${diag.status}`);
console.log(`     bindings: ${JSON.stringify(d.bindings)}`);
console.log(`     claves del limitador: ${JSON.stringify(d.clavesDelLimitador)}`);

const perfil = await fetch(`${BASE}/api/member-files/profile?cedula=30883847`, {
  headers: { cookie: todas },
});
const p = await perfil.json().catch(() => ({}));

console.log(`5) expediente              ${perfil.status}`);
console.log(`     direccion legible: ${Boolean(p?.profile?.direccion)}`);
