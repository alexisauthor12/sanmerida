/**
 * Campos personales cifrados en la base de datos (`docs/SEGURIDAD_INTEGRAL.md` 3.3).
 *
 * ## Que se cifra y que no
 *
 * Se cifra la direccion, las referencias personales y **los tres pines de ubicacion**
 * (cada uno tiene latitud, longitud y el enlace de Google Maps, que lleva las
 * coordenadas escritas dentro).
 *
 * Lo que **no** se cifra, y hay que decirlo claro: la **cedula**. Sigue en claro porque
 * ademas forma parte de las rutas del bucket de documentos, asi que cifrarla en la base
 * daria una seguridad falsa: el dato seguiria siendo legible en las claves de
 * almacenamiento. Ese es un cambio de otra envergadura (renombrar los objetos).
 *
 * ## Por que el enlace tambien
 *
 * Cifrar `ubicacionLat`/`ubicacionLng` dejando `ubicacionLink` en claro no protegeria
 * nada: las coordenadas estarian escritas en texto en la misma fila. Seria repetir el
 * error de la cedula. Por eso van los tres campos de cada pin.
 *
 * ## Compatibilidad
 *
 * Al **leer**, un valor sin el prefijo `enc:v1:` se devuelve tal cual. Asi la migracion
 * se puede hacer por partes y nada se rompe si se para a medias.
 *
 * Modulo puro: recibe el entorno como parametro para poder probarlo.
 */
import { decryptFieldWithFallback, encryptField, isEncryptedField } from "./field-crypto.mjs";
import { resolveMemberKeySecrets } from "./member-key-secret.mjs";

/** Campos que se guardan como texto cifrado. */
export const CAMPOS_TEXTO_PII = [
  "direccion",
  "references",
  "ubicacionLink",
  "referenciaLink",
  "referencia2Link",
];

/** Campos numericos que se guardan como texto cifrado. */
export const CAMPOS_NUMERO_PII = [
  "ubicacionLat",
  "ubicacionLng",
  "referenciaLat",
  "referenciaLng",
  "referencia2Lat",
  "referencia2Lng",
];

export const CAMPOS_PII = [...CAMPOS_TEXTO_PII, ...CAMPOS_NUMERO_PII];

function entornoPorDefecto() {
  return typeof process !== "undefined" && process.env ? process.env : {};
}

/** Secretos a probar al descifrar: el activo y, si existe, el heredado. */
function secretosParaDescifrar(env) {
  const { activo, heredado } = resolveMemberKeySecrets(env);

  return heredado && heredado !== activo ? [activo, heredado] : [activo];
}

/** Un valor "vacio" no se cifra: se guarda null tal cual. */
function estaVacio(valor) {
  return valor === null || valor === undefined || valor === "";
}

/**
 * Cifra los campos PII **presentes** en un objeto de escritura de Prisma.
 *
 * Solo toca las claves que ya venian: un campo ausente en un `update` significa "no
 * lo toques", y anadirlo lo sobrescribiria.
 *
 * @param {Record<string, unknown>} datos
 * @param {Record<string, string | undefined>} [env]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function encryptPiiFields(datos, env = entornoPorDefecto()) {
  if (!datos || typeof datos !== "object") return datos;

  const { activo } = resolveMemberKeySecrets(env);

  // Sin secreto no se cifra. En la practica no pasa (`AUTH_SECRET` es obligatorio),
  // pero es preferible guardar en claro que tumbar la operacion.
  if (!activo) return datos;

  const salida = { ...datos };

  for (const campo of CAMPOS_PII) {
    if (!(campo in salida)) continue;

    const valor = salida[campo];

    if (estaVacio(valor)) {
      salida[campo] = null;
      continue;
    }

    // Ya cifrado (por ejemplo, si se reenvia una fila leida): se deja como esta.
    if (isEncryptedField(valor)) continue;

    // Solo se cifran primitivas. Un operador de Prisma (`{ increment: 1 }`) no tiene
    // sentido sobre un campo personal, y convertirlo a texto lo corromperia.
    if (typeof valor !== "string" && typeof valor !== "number") continue;

    salida[campo] = await encryptField(String(valor), activo, campo);
  }

  return salida;
}

/**
 * Descifra los campos PII de una fila leida.
 *
 * Los campos numericos vuelven como **numero** (o `null`), para que la interfaz y los
 * tipos existentes sigan funcionando igual.
 *
 * @param {Record<string, unknown>} fila
 * @param {Record<string, string | undefined>} [env]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function decryptPiiFields(fila, env = entornoPorDefecto()) {
  if (!fila || typeof fila !== "object") return fila;

  const secretos = secretosParaDescifrar(env);
  const salida = { ...fila };

  for (const campo of CAMPOS_PII) {
    if (!(campo in salida)) continue;

    const valor = salida[campo];

    if (estaVacio(valor)) {
      salida[campo] = campo in CAMPOS_NUMERO_PII ? null : salida[campo];
      continue;
    }

    if (!isEncryptedField(valor)) {
      // Valor heredado en claro. Si es numerico, se normaliza a numero.
      if (CAMPOS_NUMERO_PII.includes(campo)) {
        const numero = Number(valor);

        salida[campo] = Number.isFinite(numero) ? numero : null;
      }

      continue;
    }

    const abierto = await decryptFieldWithFallback(String(valor), secretos, campo);

    if (abierto === null) {
      // Ilegible (secreto perdido o valor corrupto). Se deja constancia en vez de
      // inventarse un dato: es mejor un hueco visible que un numero falso.
      salida[campo] = null;
      continue;
    }

    if (CAMPOS_NUMERO_PII.includes(campo)) {
      const numero = Number(abierto);

      salida[campo] = Number.isFinite(numero) ? numero : null;
    } else {
      salida[campo] = abierto;
    }
  }

  return salida;
}

/**
 * Normaliza a numero o `null`.
 *
 * Existe porque el tipo que genera Prisma describe **lo que hay en la base** (texto
 * cifrado), mientras que en tiempo de ejecucion la extension devuelve un numero ya
 * descifrado. Esto acepta las dos cosas sin tener que repartir `as` por el codigo.
 *
 * @param {unknown} valor
 * @returns {number | null}
 */
export function aNumeroOpcional(valor) {
  if (valor === null || valor === undefined || valor === "") return null;

  const numero = Number(valor);

  return Number.isFinite(numero) ? numero : null;
}

/**
 * Recorre el resultado de una consulta de Prisma y descifra los campos PII.
 * Acepta una fila, un array de filas, o `null`.
 *
 * @template T
 * @param {T} resultado
 * @param {Record<string, string | undefined>} [env]
 * @returns {Promise<T>}
 */
export async function decryptPiiResult(resultado, env = entornoPorDefecto()) {
  if (Array.isArray(resultado)) {
    return Promise.all(resultado.map((fila) => decryptPiiResult(fila, env)));
  }

  if (!resultado || typeof resultado !== "object") return resultado;

  return decryptPiiFields(resultado, env);
}
