import { decryptPiiResult, encryptPiiFields } from "./member-pii.mjs";

/**
 * Extension de Prisma que cifra y descifra los campos personales de `MemberProfile`
 * **sin que ningun punto de llamada tenga que saberlo** (`docs/SEGURIDAD_INTEGRAL.md` 3.3).
 *
 * Hay mas de veinte sitios que leen o escriben `MemberProfile`. Cifrar en cada uno seria
 * fragil: basta olvidar uno para guardar texto en claro o devolver `enc:v1:...` a la
 * interfaz. Aqui se intercepta la operacion una sola vez:
 *
 *  - lo que **entra** (`data`, `create`, `update`) se cifra antes de llegar a la base;
 *  - lo que **sale** se descifra antes de devolverse.
 *
 * Los numeros de ubicacion vuelven como numeros, asi que la interfaz y los tipos
 * existentes siguen funcionando igual.
 *
 * No hay ninguna consulta cruda (`$queryRaw`) sobre esta tabla ni `include` anidado que
 * lea estos campos, que es lo unico que se escaparia de la extension.
 */

/**
 * Aplica el cifrado a los argumentos de escritura, si los hay.
 *
 * Se exporta para poder probarlo: es la pieza que decide **que** se cifra al guardar, y
 * equivocarse aqui significa guardar datos personales en claro sin que nadie se entere.
 *
 * @param {Record<string, unknown>} args
 * @returns {Promise<Record<string, unknown>>}
 */
export async function cifrarArgumentos(args) {
  if (!args || typeof args !== "object") return args;

  const salida = { ...args };

  // `data`, `create` y `update` son las tres formas en que Prisma recibe la escritura.
  // `create`/`update` son de `upsert`; `data` cubre tambien `createMany`/`updateMany`,
  // donde llega como array.
  for (const clave of ["data", "create", "update"]) {
    const valor = salida[clave];

    if (Array.isArray(valor)) {
      salida[clave] = await Promise.all(valor.map((fila) => encryptPiiFields(fila)));
    } else if (valor && typeof valor === "object") {
      salida[clave] = await encryptPiiFields(valor);
    }
  }

  return salida;
}

export const memberPiiExtension = {
  name: "member-pii",

  query: {
    memberProfile: {
      async $allOperations({ args, query }) {
        const resultado = await query(await cifrarArgumentos(args));

        return decryptPiiResult(resultado);
      },
    },
  },
};
