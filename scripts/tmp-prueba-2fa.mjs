/**
 * TEMPORAL: comprobar de punta a punta que con 2FA activo se pide UN codigo, no dos.
 *
 * Deja la cuenta como estaba: activa el segundo factor, lo prueba y lo desactiva.
 */
import { generateTotpCode } from "../src/lib/totp.mjs";

const BASE = "https://sanmeridajz.com";

const [EMAIL, PASSWORD, USUARIO, LICENCIA] = process.argv.slice(2, 6);

const cookiesDe = (r) => (r.headers.getSetCookie?.() ?? []).map((l) => l.split(";")[0]).join("; ");

const json = (r) => r.json().catch(() => ({}));

async function entrar(totpCode) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, portal: "account", totpCode }),
  });

  return { estado: r.status, cuerpo: await json(r), cookies: cookiesDe(r) };
}

// --- 1. Sesion normal para poder configurar el segundo factor -----------------
const inicial = await entrar("");

console.log(`1) login sin 2FA                       ${inicial.estado}`);

// --- 2. Generar el secreto (queda pendiente, sin activar) --------------------
const setup = await fetch(`${BASE}/api/auth/totp/setup`, {
  method: "POST",
  headers: { cookie: inicial.cookies },
});
const datosSetup = await json(setup);
const secreto = datosSetup.secret;

console.log(`2) generar secreto                     ${setup.status}  (${secreto ? "recibido" : "SIN SECRETO"})`);

// --- 3. Confirmarlo con un codigo valido -------------------------------------
const codigo = await generateTotpCode(secreto);

const enable = await fetch(`${BASE}/api/auth/totp/enable`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: inicial.cookies },
  body: JSON.stringify({ code: codigo }),
});
const datosEnable = await json(enable);

console.log(`3) activar 2FA                         ${enable.status}  codigos de recuperacion: ${datosEnable.recoveryCodes?.length ?? 0}`);

// --- 4. Con 2FA activo: el login SIN codigo tiene que fallar ------------------
const sinCodigo = await entrar("");

console.log(`4) login sin codigo (debe fallar)      ${sinCodigo.estado}  requiresTotp=${sinCodigo.cuerpo.requiresTotp}`);

// --- 5. Con UN codigo: entra -------------------------------------------------
const conCodigo = await entrar(await generateTotpCode(secreto));

console.log(`5) login con un codigo                 ${conCodigo.estado}`);

// --- 6. LA PRUEBA: la licencia NO debe volver a pedir el codigo --------------
const lic = await fetch(`${BASE}/api/auth/admin-license`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: conCodigo.cookies },
  body: JSON.stringify({ username: USUARIO, license: LICENCIA }),
});
const datosLic = await json(lic);

console.log(
  `6) licencia SIN codigo                 ${lic.status}  ${
    lic.status === 200
      ? "OK: no lo vuelve a pedir <<<< el objetivo"
      : `requiereTotp=${datosLic.requiresTotp} <<<< FALLO`
  }`,
);

// --- 7. Desactivar el segundo factor (deja la cuenta como estaba) ------------
const disable = await fetch(`${BASE}/api/auth/totp/disable`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: conCodigo.cookies },
  body: JSON.stringify({ password: PASSWORD, code: await generateTotpCode(secreto) }),
});

console.log(`7) desactivar 2FA                      ${disable.status}`);

// --- 8. Y otra vez sin codigo, como al principio ------------------------------
const final = await entrar("");

console.log(`8) login sin codigo (debe volver a 200) ${final.estado}`);
