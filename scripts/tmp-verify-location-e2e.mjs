/**
 * PRUEBA END-TO-END EN PRODUCCIÓN de las ubicaciones (cliente + referencia 1 + referencia 2).
 *
 * Qué hace:
 *  1. Crea un usuario temporal de equipo y se loguea contra el endpoint real (sesión firmada por el worker).
 *  2. Crea un expediente temporal con los documentos requeridos (como el flujo real).
 *  3. Llama al endpoint real POST /api/auth/register-member con las 3 ubicaciones.
 *  4. Verifica en Supabase que las 6 coordenadas y los 3 links quedaron guardados.
 *  5. Relee por las APIs reales (expediente + monitor) para confirmar que no se pierden.
 *  6. BORRA TODOS los datos de prueba y comprueba que la base queda igual que antes.
 *
 * Uso: node scripts/tmp-verify-location-e2e.mjs
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const BASE = "https://sanmerida-com.alexruizrondon.workers.dev";

const TEST_CEDULA = "99999999";
const TEST_MEMBER_EMAIL = "e2e.prueba.ubicacion@sanmerida.test";
const TEST_TEAM_EMAIL = "e2e.team@sanmerida.test";
const TEST_TEAM_PASSWORD = "PruebaE2E2026";
const TEST_USERNAME = "@prueba-ubicacion";
const TEST_KEY = "SAN-MEMBER-E2E001";
const TEST_MOTO = "ek-xpress";

const UBICACION = { lat: 8.5897, lng: -71.1446 };
const REF1 = { lat: 8.6011, lng: -71.15 };
const REF2 = { lat: 8.575, lng: -71.19 };

const adapter = new PrismaPg({
  connectionString: (process.env.DATABASE_URL ?? "").trim().replace(/^['"]|['"]$/g, ""),
  maxUses: 1,
});

const prisma = new PrismaClient({ adapter });
const results = [];
let before = null;

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} :: ${name}${detail ? ` :: ${detail}` : ""}`);
}

function mapsLink(point) {
  return `https://www.google.com/maps?q=${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
}

async function cleanup() {
  const profile = await prisma.memberProfile.findUnique({ where: { cedula: TEST_CEDULA } });

  if (profile) {
    await prisma.installmentPayment.deleteMany({ where: { profileId: profile.id } });
    await prisma.advancePayment.deleteMany({ where: { profileId: profile.id } });
    await prisma.memberAsset.deleteMany({ where: { profileId: profile.id } });
    await prisma.memberProfile.delete({ where: { id: profile.id } });
  }

  await prisma.user.deleteMany({ where: { email: { in: [TEST_MEMBER_EMAIL, TEST_TEAM_EMAIL] } } });
}

async function snapshot() {
  return {
    users: await prisma.user.count(),
    profiles: await prisma.memberProfile.count(),
    assets: await prisma.memberAsset.count(),
    installments: await prisma.installmentPayment.count(),
  };
}

async function main() {
  await cleanup();

  before = await snapshot();
  console.log("Base ANTES:", JSON.stringify(before));

  // 1) Usuario temporal de equipo (para autenticarnos de verdad)
  const teamUser = await prisma.user.create({
    data: {
      nombre: "E2E",
      apellido: "Prueba",
      email: TEST_TEAM_EMAIL,
      telefono: "0000000000",
      passwordHash: await bcrypt.hash(TEST_TEAM_PASSWORD, 12),
      isMember: false,
    },
  });
  console.log(`Usuario temporal de equipo creado: ${teamUser.id}`);

  // 2) Login REAL contra producción
  const loginResponse = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_TEAM_EMAIL, password: TEST_TEAM_PASSWORD, portal: "account" }),
  });
  const loginJson = await loginResponse.json().catch(() => ({}));
  const rawCookies =
    typeof loginResponse.headers.getSetCookie === "function"
      ? loginResponse.headers.getSetCookie()
      : [loginResponse.headers.get("set-cookie") ?? ""];
  const cookie = rawCookies.filter(Boolean).map((value) => value.split(";")[0]).join("; ");

  check(
    "Login real en producción",
    loginResponse.ok && cookie.includes("san_team_session"),
    `status=${loginResponse.status} ${JSON.stringify(loginJson)}`
  );

  if (!cookie) {
    throw new Error("No se obtuvo cookie de sesión; se aborta la prueba.");
  }

  // 2b) Validación de licencia de administrador (el monitor de cuotas la exige)
  const licenseResponse = await fetch(`${BASE}/api/auth/admin-license`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ username: "san-root-x9", license: "SAN-ROOT-2026-Kx9mQ2Z" }),
  });
  const licenseJson = await licenseResponse.json().catch(() => ({}));
  const adminCookies =
    typeof licenseResponse.headers.getSetCookie === "function"
      ? licenseResponse.headers.getSetCookie()
      : [licenseResponse.headers.get("set-cookie") ?? ""];
  const adminCookie = [cookie, ...adminCookies.filter(Boolean).map((value) => value.split(";")[0])].join("; ");

  check(
    "Validación de licencia de administrador",
    licenseResponse.ok && adminCookie.includes("san_admin_access"),
    `status=${licenseResponse.status} ${JSON.stringify(licenseJson)}`
  );

  // 3) Expediente temporal con los documentos requeridos
  const profile = await prisma.memberProfile.create({
    data: {
      cedula: TEST_CEDULA,
      nombre: "Prueba",
      apellido: "Ubicacion",
      telefono: "04140000000",
      email: TEST_MEMBER_EMAIL,
      direccion: "Direccion de prueba E2E (se elimina al final)",
      ocupacion: "Tester",
      empresa: "San Merida Sede Principal",
      operationalGroup: "Grupo 01",
      references: "Referencia 1 y Referencia 2",
    },
  });

  const assetDefs = [
    ["DOCUMENT", "identidad", "NORMAL"],
    ["DOCUMENT", "identidad", "SCANNED"],
    ["DOCUMENT", "rif", "NORMAL"],
    ["DOCUMENT", "rif", "SCANNED"],
    ["DOCUMENT", "licencia", "NORMAL"],
    ["DOCUMENT", "licencia", "SCANNED"],
    ["DOCUMENT", "selfie", "NORMAL"],
    ["DOCUMENT", "selfie", "SCANNED"],
    ["CONTRACT", "principal", "NORMAL"],
    ["CONTRACT", "principal", "SCANNED"],
  ];

  for (const [assetType, documentKey, variant] of assetDefs) {
    await prisma.memberAsset.create({
      data: {
        profileId: profile.id,
        assetType,
        documentKey,
        variant,
        filePath: `uploads/members/${TEST_CEDULA}/e2e-${documentKey}-${variant.toLowerCase()}.jpg`,
        fileName: `e2e-${documentKey}-${variant.toLowerCase()}.jpg`,
        mimeType: "image/jpeg",
        size: 1024,
      },
    });
  }
  console.log(`Expediente temporal creado con ${assetDefs.length} documentos.`);

  // 4) Registro REAL por el endpoint de producción con las 3 ubicaciones
  const payload = {
    nombre: "Prueba",
    apellido: "Ubicacion",
    email: TEST_MEMBER_EMAIL,
    telefono: "04140000000",
    cedula: TEST_CEDULA,
    direccion: "Direccion de prueba E2E (se elimina al final)",
    ocupacion: "Tester",
    empresa: "San Merida Sede Principal",
    operationalGroup: "Grupo 01",
    references: "Referencia 1 y Referencia 2",
    ubicacionLat: UBICACION.lat,
    ubicacionLng: UBICACION.lng,
    referenciaLat: REF1.lat,
    referenciaLng: REF1.lng,
    referencia2Lat: REF2.lat,
    referencia2Lng: REF2.lng,
    motoSlug: TEST_MOTO,
    omitCertificateOrigin: true,
    contractType: "Compraventa financiada",
    planName: "Plan de 26 cuotas (cada 15 días)",
    termMonths: 12,
    monthlyAmount: 75,
    contractStartDate: "2026-01-15",
    paymentMethod: "Transferencia",
    paymentBank: "Banco de Venezuela",
    paymentReference: "E2E-PRUEBA",
    paymentAmount: 120,
    paymentDate: "2026-01-15",
    payLater: true,
    username: TEST_USERNAME,
    encryptedKey: TEST_KEY,
  };

  const registerResponse = await fetch(`${BASE}/api/auth/register-member`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(payload),
  });
  const registerJson = await registerResponse.json().catch(() => ({}));

  check(
    "POST /api/auth/register-member guarda el registro con 3 ubicaciones",
    registerResponse.ok && registerJson.ok === true,
    `status=${registerResponse.status} ${JSON.stringify(registerJson).slice(0, 220)}`
  );

  // 5) Verificación directa en Supabase
  const saved = await prisma.memberProfile.findUnique({ where: { cedula: TEST_CEDULA } });

  check(
    "ubicacionLat/Lng del cliente guardadas",
    saved?.ubicacionLat === UBICACION.lat && saved?.ubicacionLng === UBICACION.lng,
    `lat=${saved?.ubicacionLat} lng=${saved?.ubicacionLng}`
  );
  check(
    "referenciaLat/Lng (referencia 1) guardadas",
    saved?.referenciaLat === REF1.lat && saved?.referenciaLng === REF1.lng,
    `lat=${saved?.referenciaLat} lng=${saved?.referenciaLng}`
  );
  check(
    "referencia2Lat/Lng (referencia 2) guardadas",
    saved?.referencia2Lat === REF2.lat && saved?.referencia2Lng === REF2.lng,
    `lat=${saved?.referencia2Lat} lng=${saved?.referencia2Lng}`
  );
  check(
    "Los 3 links de Google Maps se generaron",
    saved?.ubicacionLink === mapsLink(UBICACION) &&
      saved?.referenciaLink === mapsLink(REF1) &&
      saved?.referencia2Link === mapsLink(REF2),
    `${saved?.ubicacionLink} | ${saved?.referenciaLink} | ${saved?.referencia2Link}`
  );

  // 6) Relectura por las APIs reales (comprobar que no se pierde al leer)
  const profileResponse = await fetch(`${BASE}/api/member-files/profile?cedula=${TEST_CEDULA}`, {
    headers: { Cookie: adminCookie, "Cache-Control": "no-cache" },
  });
  const profileText = await profileResponse.text();
  const profileJson = JSON.parse(profileText || "{}");

  console.log("Respuesta cruda del expediente:", profileText.slice(0, 900));

  check(
    "GET /api/member-files/profile devuelve las 3 ubicaciones",
    profileJson?.profile?.ubicacionLat === UBICACION.lat &&
      profileJson?.profile?.referenciaLat === REF1.lat &&
      profileJson?.profile?.referencia2Lat === REF2.lat,
    `status=${profileResponse.status} ubicacion=${profileJson?.profile?.ubicacionLat} ref1=${profileJson?.profile?.referenciaLat} ref2=${profileJson?.profile?.referencia2Lat}`
  );

  const monitorResponse = await fetch(`${BASE}/api/monitor-cuotas`, {
    headers: { Cookie: adminCookie, "Cache-Control": "no-cache" },
  });
  const monitorText = await monitorResponse.text();
  const hasRef2 = monitorText.includes(`"referencia2Lat":${REF2.lat}`) && monitorText.includes(`"referencia2Lng":${REF2.lng}`);
  const hasRef1 = monitorText.includes(`"referenciaLat":${REF1.lat}`) && monitorText.includes(`"referenciaLng":${REF1.lng}`);
  const hasCliente = monitorText.includes(`"ubicacionLat":${UBICACION.lat}`);

  check("GET /api/monitor-cuotas expone la ubicación del cliente", hasCliente, `status=${monitorResponse.status}`);
  check("GET /api/monitor-cuotas expone la referencia 1", hasRef1);
  check("GET /api/monitor-cuotas expone la referencia 2", hasRef2);

  // 7) Relectura repetida (descartar pérdidas por caché)
  let stable = true;
  for (let i = 0; i < 3; i += 1) {
    const again = await prisma.memberProfile.findUnique({ where: { cedula: TEST_CEDULA } });
    if (again?.referencia2Lat !== REF2.lat || again?.ubicacionLng !== UBICACION.lng || again?.referenciaLng !== REF1.lng) {
      stable = false;
    }
  }
  check("Las 3 ubicaciones siguen intactas tras varias lecturas", stable);
}

async function run() {
  try {
    await main();
  } catch (error) {
    console.error("[ERROR]", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    console.log("\n--- Limpieza de datos de prueba ---");
    try {
      await cleanup();
      const after = await snapshot();
      console.log("Base DESPUÉS:", JSON.stringify(after));
      check(
        "Producción queda igual que antes (datos de prueba eliminados)",
        JSON.stringify(after) === JSON.stringify(before),
        `antes=${JSON.stringify(before)} despues=${JSON.stringify(after)}`
      );
    } catch (error) {
      console.error("Error limpiando:", error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }

    const failed = results.filter((item) => !item.ok);
    console.log(`\nRESULTADO: ${results.length - failed.length}/${results.length} comprobaciones OK`);
    if (failed.length > 0) {
      console.log("FALLARON:");
      for (const item of failed) console.log(` - ${item.name}${item.detail ? ` :: ${item.detail}` : ""}`);
      process.exitCode = 1;
    }

    await prisma.$disconnect();
  }
}

void run();

