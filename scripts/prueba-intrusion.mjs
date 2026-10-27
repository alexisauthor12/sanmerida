/**
 * Prueba de intrusion automatizada (`docs/SEGURIDAD_INTEGRAL.md` 11.6).
 *
 * Cubre los casos que **no necesitan credenciales**: los que cualquiera puede
 * intentar desde internet. Los que sí las necesitan (leer el expediente de otro,
 * descarga masiva, step-up de licencia, cambio de contraseña autenticado) quedan
 * listados como MANUAL al final: se hacen a mano con una cuenta de prueba.
 *
 * Uso:
 *   node scripts/prueba-intrusion.mjs                          (produccion)
 *   node scripts/prueba-intrusion.mjs https://otro-dominio.com  (otro entorno)
 *   node scripts/prueba-intrusion.mjs http://localhost:3000     (local)
 *
 * OJO con el dominio: hay que pasar el que de verdad sirve la aplicacion. Si se
 * apunta a un dominio que no es el proyecto, todo responde 404 y la prueba no dice
 * nada. Comprobacion rapida (ver `docs/OPERACIONES_PRODUCCION.md` 9.10):
 * `curl.exe -s -D - -o NUL https://EL-DOMINIO/ | Select-String "x-opennext|report-uri"`
 * — la app responde `x-opennext: 1` y `report-uri /api/csp-report`.
 *
 * No escribe nada: todos los POST usan datos que deben ser rechazados **antes** de
 * tocar la base de datos (contraseñas débiles, sin consentimiento, sin sesión).
 */
import { SignJWT } from "jose";

const BASE = (process.argv[2] ?? "https://sanmeridajz.com").replace(/\/+$/, "");

const COOKIE_SESION = "san_team_session";
const COOKIE_LICENCIA = "san_admin_access";

const resultados = [];
let fallos = 0;

/** Cabeceras de seguridad que debe traer la home (seccion 9.1). */
const CABECERAS_ESPERADAS = [
  "strict-transport-security",
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy",
  "permissions-policy",
  "cross-origin-opener-policy",
  "content-security-policy",
  "content-security-policy-report-only",
  "reporting-endpoints",
];

/** Marcas de que un error interno se ha filtrado al cliente. */
const FUGAS = ["prisma", "postgres", "at Object.", "node_modules", "stack", "ECONNREFUSED", "passwordHash"];

async function comprobar(numero, titulo, ejecutar) {
  try {
    const { ok, detalle } = await ejecutar();

    if (!ok) fallos += 1;
    resultados.push({ numero, titulo, ok, detalle });
  } catch (error) {
    fallos += 1;
    resultados.push({ numero, titulo, ok: false, detalle: `excepción: ${error.message}` });
  }
}

/** Comprueba que la respuesta tenga uno de los estados esperados. */
function estado(respuesta, esperados) {
  const ok = esperados.includes(respuesta.status);

  return {
    ok,
    detalle: `${respuesta.status} (esperado ${esperados.join(" o ")})`,
  };
}

/** Comprueba que el cuerpo no filtre detalles internos. */
async function sinFugas(respuesta) {
  const texto = await respuesta.text().catch(() => "");
  const encontradas = FUGAS.filter((marca) => texto.toLowerCase().includes(marca.toLowerCase()));

  return {
    ok: encontradas.length === 0,
    detalle: encontradas.length === 0 ? "sin detalles internos" : `FUGA: ${encontradas.join(", ")}`,
  };
}

/** Un JWT bien formado pero firmado con un secreto que no es el de la app. */
async function tokenDeOtroSecreto() {
  const secreto = new TextEncoder().encode("secreto-ajeno-de-prueba-que-no-es-el-de-la-aplicacion");

  return new SignJWT({ role: "ADMIN", tv: 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("00000000-0000-0000-0000-000000000000")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secreto);
}

function correoAleatorio() {
  return `prueba-intrusion-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

console.log(`\nPrueba de intrusión contra ${BASE}\n${"=".repeat(60)}`);

// ---------------------------------------------------------------------------
// 1. Cabeceras de seguridad y disponibilidad
// ---------------------------------------------------------------------------

await comprobar(1, "La home responde y trae todas las cabeceras de seguridad", async () => {
  const respuesta = await fetch(BASE);
  const faltan = CABECERAS_ESPERADAS.filter((cabecera) => !respuesta.headers.get(cabecera));

  return {
    ok: respuesta.status === 200 && faltan.length === 0,
    detalle:
      respuesta.status !== 200
        ? `estado ${respuesta.status}`
        : faltan.length === 0
          ? `${CABECERAS_ESPERADAS.length} cabeceras presentes`
          : `FALTAN: ${faltan.join(", ")}`,
  };
});

// ---------------------------------------------------------------------------
// 2-7. Rutas protegidas sin sesión
// ---------------------------------------------------------------------------

const SIN_SESION = [
  [3, "GET /api/member-panel", "/api/member-panel", [401, 403]],
  [4, "GET /api/member-files/profile", "/api/member-files/profile?cedula=V-12345678", [401, 403]],
  // El endpoint valida el formato de la clave antes de la sesion, asi que puede
  // responder 400. Lo que importa es que **no devuelva contenido**.
  [5, "GET /api/member-files/file", "/api/member-files/file?key=documentos/x.pdf", [400, 401, 403]],
  [6, "GET /api/auditoria", "/api/auditoria", [401, 403]],
  [7, "GET /api/monitor-cuotas", "/api/monitor-cuotas", [401, 403]],
];

for (const [numero, titulo, ruta, esperados] of SIN_SESION) {
  await comprobar(numero, `${titulo} sin sesión`, async () => estado(await fetch(`${BASE}${ruta}`), esperados));
}

// `session-status` es publica por diseno: se llama antes de tener sesion para saber
// si la hay. Lo que NO puede es decir que hay sesion cuando no la hay.
await comprobar(2, "GET /api/auth/session-status sin sesión no la da por válida", async () => {
  const respuesta = await fetch(`${BASE}/api/auth/session-status`);
  const cuerpo = await respuesta.json().catch(() => ({}));
  const diceAutenticado = cuerpo?.authenticated === true || Boolean(cuerpo?.user);

  return {
    ok: respuesta.status === 200 && !diceAutenticado,
    detalle: `${respuesta.status}, authenticated=${JSON.stringify(cuerpo?.authenticated)}`,
  };
});

// ---------------------------------------------------------------------------
// 8-9. Tokens firmados con otro secreto
// ---------------------------------------------------------------------------

await comprobar(8, "Cookie de sesión firmada con otro secreto", async () => {
  const respuesta = await fetch(`${BASE}/api/member-panel`, {
    headers: { cookie: `${COOKIE_SESION}=${await tokenDeOtroSecreto()}` },
  });

  return estado(respuesta, [401, 403]);
});

await comprobar(9, "Cookie de licencia firmada con otro secreto", async () => {
  const respuesta = await fetch(`${BASE}/api/auditoria`, {
    headers: { cookie: `${COOKIE_LICENCIA}=${await tokenDeOtroSecreto()}` },
  });

  return estado(respuesta, [401, 403]);
});

// ---------------------------------------------------------------------------
// 10. La ruta de login administrativo directo ya no existe
// ---------------------------------------------------------------------------

await comprobar(10, "POST /api/auth/admin-direct-login (ruta eliminada)", async () => {
  const respuesta = await fetch(`${BASE}/api/auth/admin-direct-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "@admin", password: "x" }),
  });

  return estado(respuesta, [404, 405]);
});

// ---------------------------------------------------------------------------
// 11-13. Politica de contrasenas y consentimiento en el registro
// ---------------------------------------------------------------------------

function registro(cuerpo) {
  return fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
}

function baseRegistro() {
  return {
    nombre: "Prueba",
    apellido: "Intrusion",
    email: correoAleatorio(),
    telefono: "04140000000",
    consentimiento: true,
  };
}

await comprobar(11, "Registro con contraseña de 8 caracteres", async () => {
  const respuesta = await registro({
    ...baseRegistro(),
    password: "Abc1!xyz",
    confirmPassword: "Abc1!xyz",
    skipSession: true,
  });

  return estado(respuesta, [400]);
});

await comprobar(12, "Registro con contraseña común (Password1234)", async () => {
  const respuesta = await registro({
    ...baseRegistro(),
    password: "Password1234",
    confirmPassword: "Password1234",
    skipSession: true,
  });

  return estado(respuesta, [400]);
});

await comprobar(13, "Registro SIN aceptar el aviso de tratamiento de datos", async () => {
  const cuerpo = baseRegistro();

  delete cuerpo.consentimiento;

  const respuesta = await registro({
    ...cuerpo,
    password: "Tractor-Verde-47!",
    confirmPassword: "Tractor-Verde-47!",
    skipSession: true,
  });

  return estado(respuesta, [400]);
});

// ---------------------------------------------------------------------------
// 14-17. Escrituras sin sesión
// ---------------------------------------------------------------------------

const ESCRITURAS_SIN_SESION = [
  [14, "POST /api/auth/cambiar-contrasena", "/api/auth/cambiar-contrasena", [401, 403]],
  [15, "POST /api/auth/totp/disable", "/api/auth/totp/disable", [401, 403]],
  [16, "POST /api/auth/totp/setup", "/api/auth/totp/setup", [401, 403]],
  [17, "POST /api/member-panel/correccion", "/api/member-panel/correccion", [401, 403]],
];

for (const [numero, titulo, ruta, esperados] of ESCRITURAS_SIN_SESION) {
  await comprobar(numero, `${titulo} sin sesión`, async () => {
    const respuesta = await fetch(`${BASE}${ruta}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actual: "x",
        nueva: "Tractor-Verde-47!",
        confirmar: "Tractor-Verde-47!",
      }),
    });

    return estado(respuesta, esperados);
  });
}

// ---------------------------------------------------------------------------
// 18. El colector de CSP aguanta un cuerpo enorme sin caerse
// ---------------------------------------------------------------------------

await comprobar(18, "POST /api/csp-report con 1 MB de cuerpo", async () => {
  const respuesta = await fetch(`${BASE}/api/csp-report`, {
    method: "POST",
    headers: { "content-type": "application/csp-report" },
    body: "x".repeat(1024 * 1024),
  });

  return {
    ok: respuesta.status < 500,
    detalle: `${respuesta.status} (no puede ser 5xx)`,
  };
});

// ---------------------------------------------------------------------------
// 19. Los errores no filtran detalles internos
// ---------------------------------------------------------------------------

await comprobar(19, "Los errores no filtran detalles internos", async () => {
  const respuesta = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{ esto no es json valido",
  });

  return sinFugas(respuesta);
});

// ---------------------------------------------------------------------------
// 20. La base de datos responde de verdad (una consulta real, no solo validaciones)
// ---------------------------------------------------------------------------

await comprobar(20, "El login consulta la base de datos (401, nunca 500)", async () => {
  // Este caso nace de una caida real. Al actualizarse `@opennextjs/cloudflare` se perdio
  // el parche de Windows que hace que Prisma use el motor WASM dentro del Worker. A
  // partir de ahi el cliente generado intentaba leer el compilador del disco
  // (`fs.readFileSync`, que no existe en un Worker) y **todas** las consultas fallaban:
  // el login devolvia 500 y nadie podia entrar.
  //
  // Los otros 19 casos no lo detectaron porque **ninguno toca la base**: todos cortan
  // antes, en la autorizacion o en la validacion. Este es el unico que obliga a que haya
  // una consulta de verdad. Un 401 significa "consulte y no hay tal usuario"; un 500
  // significa que Prisma no puede hablar con la base.
  const respuesta = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `no-existe-${Date.now()}@example.com`,
      password: "contrasena-que-no-sirve",
      portal: "account",
    }),
  });

  return {
    ok: respuesta.status === 401,
    detalle:
      respuesta.status === 401
        ? "401: la base respondio"
        : `${respuesta.status} (se esperaba 401; un 500 significa que Prisma no habla con la base)`,
  };
});

// ---------------------------------------------------------------------------
// Informe
// ---------------------------------------------------------------------------

const MANUALES = [
  "Cuenta de equipo SIN licencia pide el expediente de otra cédula -> 403",
  "Cuenta de equipo SIN licencia pide un documento ajeno -> 403",
  "Miembro pide el documento de otro miembro -> 404",
  "Token válido después de «cerrar todas las sesiones» -> 401",
  "6 intentos fallidos de login seguidos -> 429 y cuenta bloqueada",
  "Cédula inexistente vs. existente: misma forma y tiempo de respuesta",
  "Cuenta PROSPECT intenta leer el expediente de un miembro -> 403",
  "Cuenta PROSPECT intenta descargar o borrar un documento -> 403",
  "ADMIN sin licencia válida intenta ver credenciales o borrar -> 403",
  "Descarga masiva de documentos (más de 120 en 5 min) -> 429",
  "Cambiar la contraseña y reutilizar la cookie anterior -> 401",
  "Desactivar el 2FA sin aportar el código -> 400/403",
];

console.log(`\n${"=".repeat(60)}\nRESULTADOS\n${"=".repeat(60)}\n`);

for (const { numero, titulo, ok, detalle } of resultados) {
  console.log(`${ok ? "OK  " : "FALLO"} [${String(numero).padStart(2)}] ${titulo}\n           ${detalle}`);
}

console.log(`\n${"=".repeat(60)}`);
console.log(`  ${resultados.length - fallos}/${resultados.length} casos automaticos OK`);
console.log(`${"=".repeat(60)}\n`);

console.log("Casos MANUALES (necesitan una cuenta de prueba):\n");

for (const caso of MANUALES) console.log(`  - ${caso}`);

console.log("");
process.exitCode = fallos === 0 ? 0 : 1;
