/**
 * Politica de contrasenas (`docs/SEGURIDAD_INTEGRAL.md` 7.5).
 *
 * La contrasena es el **primer factor**: si es debil, el 2FA, el rate limiting y el
 * bloqueo progresivo protegen una puerta que ya estaba abierta.
 *
 * Reglas:
 *  - Minimo 12 caracteres.
 *  - Al menos 3 de 4 tipos: minuscula, mayuscula, digito y simbolo.
 *  - Ni la contrasena actual (lo comprueba el endpoint con bcrypt).
 *  - No puede contener datos del propio usuario (nombre, apellido, correo) ni las
 *    palabras obvias del negocio.
 *
 * Modulo PURO: sin dependencias, para poder probarlo.
 */

export const PASSWORD_MIN_LENGTH = 12;

/**
 * Tope de longitud. No es capricho: **bcrypt solo procesa los primeros 72 bytes**,
 * asi que todo lo que pase de ahi no aporta entropia y da una falsa sensacion de
 * seguridad. Se rechaza en vez de truncar en silencio.
 */
export const PASSWORD_MAX_BYTES = 72;

/** Cuantos de los cuatro tipos hay que cumplir. */
export const MIN_CRITERIA = 3;

/** Tipos de caracteres que se exigen (3 de 4). */
export const PASSWORD_CRITERIA = [
  { id: "minuscula", etiqueta: "una minúscula", test: (valor) => /[a-z]/.test(valor) },
  { id: "mayuscula", etiqueta: "una mayúscula", test: (valor) => /[A-Z]/.test(valor) },
  { id: "digito", etiqueta: "un número", test: (valor) => /\d/.test(valor) },
  { id: "simbolo", etiqueta: "un símbolo", test: (valor) => /[^A-Za-z0-9]/.test(valor) },
];

/**
 * Contrasenas comunes y palabras obvias del negocio.
 *
 * No pretende ser exhaustiva (para eso haria falta un servicio de contrasenas
 * filtradas): cubre lo que de verdad se elige cuando nadie obliga a nada.
 */
const PROHIBIDAS = new Set([
  "123456789012", "1234567890123", "12345678901234", "123456789012345",
  "qwertyuiopas", "qwerty123456", "password1234", "password12345",
  "contrasena12", "contraseña12", "administrador", "administrator1",
  "sanmerida123", "sanmerida2026", "merida123456", "merida2026san",
  "motosanmerida", "sanmeridamotos", "teamsanmerida1", "venezuela123",
  "caracas12345", "moto123456789", "financiamiento", "abcdefghijkl",
  "asdfghjklqwe", "zxcvbnmasdfg", "098765432109", "aaaaaaaaaaaa",
  "111111111111", "000000000000", "iloveyou1234", "welcome12345",
  "monkey123456", "dragon123456", "letmein12345", "sunshine1234",
  "princess1234", "football1234", "baseball1234", "superman1234",
  "trustno12345", "changeme1234", "sanmerida.com",
]);

/** Palabras del negocio que nunca deberian formar parte de una contrasena. */
const PALABRAS_DEL_NEGOCIO = ["sanmerida", "merida", "teamsan", "moto", "financiamiento"];

/** Normaliza a minusculas y sin acentos, para comparar de forma consistente. */
function normalizar(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Longitud en bytes UTF-8 (es lo que ve bcrypt, no los caracteres). */
export function passwordByteLength(value) {
  return new TextEncoder().encode(String(value ?? "")).length;
}

/**
 * Evalua la contrasena sin juzgarla: devuelve que cumple y que no.
 * Lo usa la interfaz para mostrar la lista en vivo.
 *
 * @param {string} value
 * @returns {{ longitud: number, bytes: number, cumplidos: number, criterios: Array<{ id: string, etiqueta: string, cumple: boolean }> }}
 */
export function evaluatePassword(value) {
  const texto = String(value ?? "");

  const criterios = PASSWORD_CRITERIA.map((criterio) => ({
    id: criterio.id,
    etiqueta: criterio.etiqueta,
    cumple: criterio.test(texto),
  }));

  return {
    longitud: texto.length,
    bytes: passwordByteLength(texto),
    cumplidos: criterios.filter((criterio) => criterio.cumple).length,
    criterios,
  };
}

/**
 * Fragmentos que no pueden aparecer en la contrasena: datos del propio usuario.
 * @param {{ nombre?: string, apellido?: string, email?: string }} [usuario]
 * @returns {string[]}
 */
export function forbiddenFragments(usuario = {}) {
  const partes = new Set();

  const anadir = (valor) => {
    const limpio = normalizar(valor).replace(/[^a-z0-9]/g, "");

    // Fragmentos de 4 caracteres o mas: por debajo no significan nada.
    if (limpio.length >= 4) partes.add(limpio);
  };

  anadir(usuario.nombre);
  anadir(usuario.apellido);

  const correo = normalizar(usuario.email);
  const local = correo.split("@")[0] ?? "";

  anadir(local);
  // Tambien cada palabra del correo (juan.perez -> "juan", "perez").
  for (const trozo of local.split(/[^a-z0-9]+/)) anadir(trozo);

  for (const palabra of PALABRAS_DEL_NEGOCIO) anadir(palabra);

  return [...partes];
}

/**
 * Valida una contrasena nueva.
 *
 * @param {string} value
 * @param {{ nombre?: string, apellido?: string, email?: string }} [usuario]
 * @returns {{ ok: true } | { ok: false, message: string, faltantes: string[] }}
 */
export function validatePassword(value, usuario = {}) {
  const texto = String(value ?? "");
  const evaluacion = evaluatePassword(texto);

  if (evaluacion.longitud < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      message: `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
      faltantes: [`${PASSWORD_MIN_LENGTH} caracteres`],
    };
  }

  if (evaluacion.bytes > PASSWORD_MAX_BYTES) {
    return {
      ok: false,
      // Se rechaza en vez de truncar: truncar en silencio es peor que avisar.
      message: `La contraseña es demasiado larga (máximo ${PASSWORD_MAX_BYTES} bytes; los acentos y emojis cuentan más de un byte).`,
      faltantes: ["menos longitud"],
    };
  }

  if (evaluacion.cumplidos < MIN_CRITERIA) {
    return {
      ok: false,
      message: `La contraseña debe incluir al menos ${MIN_CRITERIA} de estos 4 tipos: minúscula, mayúscula, número y símbolo.`,
      faltantes: evaluacion.criterios
        .filter((criterio) => !criterio.cumple)
        .map((criterio) => criterio.etiqueta),
    };
  }

  const normalizada = normalizar(texto);

  if (PROHIBIDAS.has(normalizada)) {
    return {
      ok: false,
      message: "Esa contraseña es demasiado común. Elige otra.",
      faltantes: ["una contraseña menos común"],
    };
  }

  // Se comprueba el texto normalizado y tambien sin separadores, para que
  // "juan.perez.2026" no pase por llevar puntos.
  const sinSeparadores = normalizada.replace(/[^a-z0-9]/g, "");
  const prohibidos = forbiddenFragments(usuario).filter(
    (fragmento) => normalizada.includes(fragmento) || sinSeparadores.includes(fragmento),
  );

  if (prohibidos.length > 0) {
    return {
      ok: false,
      message: "La contraseña no puede contener tu nombre, tu correo ni el nombre del negocio.",
      faltantes: ["sin datos personales"],
    };
  }

  return { ok: true };
}
