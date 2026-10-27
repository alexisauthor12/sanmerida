/**
 * Opciones TLS para las conexiones Postgres directas de los scripts
 * (`docs/SEGURIDAD_INTEGRAL.md`, hallazgo F).
 *
 * ## Por que no basta con `rejectUnauthorized: true`
 *
 * Hecho verificado, no supuesto: el pooler de Supabase (Supavisor, **puertos 6543 y
 * 5432**) presenta un certificado **autofirmado en la cadena**, asi que `pg` no puede
 * validarlo contra la lista de CAs de Node. No es un proxy del equipo: desde la misma
 * maquina, GitHub, npm y supabase.com validan sin problema.
 *
 * La documentacion oficial de Supabase lo explica asi: `sslmode=require` **cifra pero
 * no verifica**, y para verificar hay que descargar el certificado raiz del proyecto
 * (Database settings -> SSL configuration) y apuntar el driver a el
 * (`sslmode=verify-full` + `sslrootcert`).
 *
 * ## Los tres modos
 *
 *   DATABASE_CA_CERT=/ruta/raiz.crt      -> valida contra la CA del proyecto (correcto)
 *   NODE_EXTRA_CA_CERTS=/ruta/raiz.crt   -> lo mismo, pero a nivel de Node
 *   DATABASE_SSL_NO_VERIFY=1             -> cifra SIN verificar: acto deliberado y avisado
 *
 * Sin ninguna de esas variables se **valida**, y si falla el mensaje explica como
 * arreglarlo. Nunca se degrada a "sin verificar" en silencio.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const CA_ENV = "DATABASE_CA_CERT";
export const NO_VERIFY_ENV = "DATABASE_SSL_NO_VERIFY";
export const EXTRA_CA_ENV = "NODE_EXTRA_CA_CERTS";

/**
 * CA raiz del proyecto, **incluida en el repositorio**.
 *
 * No es un secreto: es un certificado publico (el "Supabase Root 2021 CA"), el mismo
 * que Supabase indica descargar en *Database settings → SSL configuration*. Se incluye
 * para que la validacion funcione sin que nadie tenga que configurar nada.
 *
 * Se extrajo de la propia cadena del pooler (leaf → intermedio → raiz autofirmada).
 * Valido hasta abril de 2031.
 */
export const BUNDLED_CA_PATH = fileURLToPath(
  new URL("../../certs/supabase-ca.crt", import.meta.url),
);

/** ¿La URL apunta a Supabase (pooler o conexion directa)? */
export function isSupabaseDatabase(url) {
  return /\.pooler\.supabase\.com|\.supabase\.co/i.test(String(url ?? ""));
}

/** ¿La URL apunta al Postgres local de desarrollo? */
export function isLocalDatabase(url) {
  return /127\.0\.0\.1|localhost/.test(String(url ?? ""));
}

/** Un valor de entorno cuenta como "si" solo si es explicitamente afirmativo. */
function activado(valor) {
  return ["1", "true", "si", "sí", "yes"].includes(String(valor ?? "").toLowerCase().trim());
}

/**
 * Decide el modo TLS sin leer nada del disco.
 *
 * @param {string} url
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ modo: "local" | "ca" | "proyecto" | "extra-ca" | "validar" | "sin-verificar", caPath: string, motivo: string }}
 */
export function resolveDbSslMode(url, env = {}) {
  if (isLocalDatabase(url)) {
    return { modo: "local", caPath: "", motivo: "Postgres local de desarrollo" };
  }

  // El acto deliberado manda sobre todo lo demas, para que se pueda usar en un
  // entorno donde no haya forma de conseguir la CA.
  if (activado(env[NO_VERIFY_ENV])) {
    return {
      modo: "sin-verificar",
      caPath: "",
      motivo: `${NO_VERIFY_ENV} activado a mano`,
    };
  }

  const caPath = String(env[CA_ENV] ?? "").trim();

  if (caPath) {
    return { modo: "ca", caPath, motivo: `${CA_ENV} definido` };
  }

  const extraCa = String(env[EXTRA_CA_ENV] ?? "").trim();

  if (extraCa) {
    // Node ya lo carga solo: no hay que pasar nada al driver.
    return { modo: "extra-ca", caPath: extraCa, motivo: `${EXTRA_CA_ENV} definido` };
  }

  // CA del proyecto incluida en el repositorio. Solo se aplica a Supabase: contra otro
  // proveedor (Neon, RDS...) su certificado publico ya valida con la CA del sistema, y
  // forzar la de Supabase lo romperia.
  if (isSupabaseDatabase(url) && existsSync(BUNDLED_CA_PATH)) {
    return {
      modo: "proyecto",
      caPath: BUNDLED_CA_PATH,
      motivo: "CA del proyecto incluida en el repositorio",
    };
  }

  return { modo: "validar", caPath: "", motivo: "sin CA del proyecto: se valida contra la CA del sistema" };
}

/**
 * Aviso que hay que mostrar cuando la validacion esta desactivada.
 * Devuelve `null` cuando no hay nada que avisar.
 *
 * @param {ReturnType<typeof resolveDbSslMode>["modo"]} modo
 * @returns {string | null}
 */
export function sslWarning(modo) {
  if (modo !== "sin-verificar") return null;

  return [
    "",
    "  ⚠  ATENCIÓN: la validación del certificado TLS está DESACTIVADA.",
    `     (${NO_VERIFY_ENV} activado)`,
    "     La conexión va cifrada, pero nadie comprueba que el servidor sea quien dice",
    "     ser: alguien en tu red podría leer el tráfico y los datos que pasan por él.",
    "",
    "     Para arreglarlo, descarga el certificado raíz del proyecto",
    "     (Supabase → Database settings → SSL configuration) y define:",
    `        ${CA_ENV}=/ruta/al/certificado.crt`,
    `     y quita ${NO_VERIFY_ENV}.`,
    "",
  ].join("\n");
}

/** ¿El error es de certificado TLS? Sirve para dar una pista util en vez de un volcado. */
export function isCertificateError(error) {
  const texto = `${error?.code ?? ""} ${error?.message ?? ""}`;

  return /SELF_SIGNED_CERT|CERT_|UNABLE_TO_VERIFY|self-signed|certificate/i.test(texto);
}

/** Pista que se muestra cuando la conexion falla por certificado. */
export const CERTIFICATE_HINT = [
  "",
  "  La conexión falló al validar el certificado del servidor.",
  "",
  "  Es lo esperado: el pooler de Supabase presenta un certificado autofirmado en la",
  "  cadena y no valida contra la lista de CAs de Node.",
  "",
  "  Solución correcta (una sola vez):",
  "    1. Supabase → Database settings → SSL configuration → descarga el certificado.",
  `    2. Define ${CA_ENV}=/ruta/al/certificado.crt`,
  "",
  "  Alternativa de último recurso (cifra sin verificar, queda avisado en pantalla):",
  `    ${NO_VERIFY_ENV}=1`,
  "",
].join("\n");

/**
 * Construye la opcion `ssl` para `pg`.
 *
 * @param {string} url
 * @param {Record<string, string | undefined>} [env]
 * @param {(ruta: string) => string} [leerArchivo] Inyectable para poder probarlo.
 * @returns {{ ssl: object | undefined, aviso: string | null, modo: string }}
 */
export function buildDbSsl(url, env = {}, leerArchivo) {
  const resolucion = resolveDbSslMode(url, env);

  if (resolucion.modo === "local") {
    return { ssl: undefined, aviso: null, modo: resolucion.modo };
  }

  if (resolucion.modo === "sin-verificar") {
    return {
      ssl: { rejectUnauthorized: false },
      aviso: sslWarning(resolucion.modo),
      modo: resolucion.modo,
    };
  }

  // "ca" y "proyecto" (CA incluida en el repositorio): se le pasa el certificado.
  if (resolucion.modo === "ca" || resolucion.modo === "proyecto") {
    const leer = leerArchivo ?? ((ruta) => readFileSync(ruta, "utf8"));

    return {
      ssl: { rejectUnauthorized: true, ca: leer(resolucion.caPath) },
      aviso: null,
      modo: resolucion.modo,
    };
  }

  // "validar" y "extra-ca": Node se encarga con su almacen o con NODE_EXTRA_CA_CERTS.
  return { ssl: { rejectUnauthorized: true }, aviso: null, modo: resolucion.modo };
}

let avisoYaMostrado = false;
let notaYaMostrada = false;

/** Nota de una linea que se muestra cuando no hay CA configurada. */
export const NOTE_NO_CA =
  `[tls] Sin ${CA_ENV}: se validará el certificado del servidor con la CA del sistema. ` +
  `Si falla, define ${CA_ENV} con la CA de tu proveedor — ver ` +
  `docs/OPERACIONES_PRODUCCION.md §9.9.`;

/**
 * Atajo para los scripts: devuelve solo la opcion `ssl` y explica (una vez por
 * proceso) en que modo se esta conectando.
 *
 * @param {string} url
 * @param {Record<string, string | undefined>} [env]
 * @returns {object | undefined}
 */
export function dbSslFor(url, env = process.env) {
  const { ssl, aviso, modo } = buildDbSsl(url, env);

  if (aviso && !avisoYaMostrado) {
    avisoYaMostrado = true;
    console.warn(aviso);
  }

  // Sin CA configurada la validacion puede fallar contra el pooler de Supabase: se
  // deja dicho de antemano para que el error, si llega, no sorprenda ni se
  // "arregle" desactivando la validacion.
  if (modo === "validar" && !notaYaMostrada) {
    notaYaMostrada = true;
    console.log(NOTE_NO_CA);
  }

  return ssl;
}
