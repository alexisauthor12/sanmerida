/**
 * Autorizacion por rol (RBAC) — fuente unica de verdad.
 *
 * Modulo PURO: sin React, sin base de datos y sin dependencias de Next. Se puede
 * importar desde las rutas de servidor, desde el panel y desde las pruebas, igual
 * que `installment-schedule.mjs` o `noticias-feed.mjs`.
 *
 * Regla de oro: **todo endpoint nace cerrado**. Los permisos se conceden aqui de
 * forma explicita y las rutas los consumen a traves de `lib/api-guard.ts`.
 *
 * Diseno completo en `docs/SEGURIDAD_INTEGRAL.md`.
 */

/**
 * Roles del sistema.
 *
 * - PROSPECT: registro inicial publico (`/register`). Ve catalogo, precios y feed
 *   publicado. **Nunca** accede a expedientes, documentos ni cuotas.
 * - MEMBER:   miembro oficial con expediente. Solo lo suyo.
 * - ADMIN:    unico rol con poder. Opera con licencia administrativa (step-up).
 *
 * No existe un rol OPERATOR: no hay ningun nivel intermedio capaz de leer
 * expedientes sin la licencia validada.
 */
export const ROLES = ["PROSPECT", "MEMBER", "ADMIN"];

/** Descripcion legible de cada rol (para el panel y los mensajes de error). */
export const ROLE_DESCRIPTIONS = {
  PROSPECT: "Registro inicial publico: catalogo, precios y novedades publicadas.",
  MEMBER: "Miembro oficial: su expediente, sus cuotas y sus documentos.",
  ADMIN: "Personal autorizado: todo, con licencia administrativa para lo critico.",
};

/** Catalogo completo de permisos del sistema. */
export const PERMISSIONS = [
  "expediente:read:own",
  "expediente:read:any",
  "expediente:create",
  "expediente:update",
  "expediente:delete",
  "documento:read:own",
  "documento:read:any",
  "documento:upload",
  "documento:scan",
  "documento:delete",
  "cuota:read:own",
  "cuota:read:any",
  "cuota:payment:register",
  "cuota:payment:revert",
  "credencial:read",
  "credencial:rotate",
  "financiamiento:read",
  "financiamiento:write",
  "novedad:read:published",
  "novedad:read:any",
  "novedad:write",
  "grupo:read",
  "grupo:export",
  "auditoria:read",
  "usuario:manage",
];

/**
 * Permisos por rol.
 *
 * PROSPECT solo ve lo publico: el auto-registro deja de ser una via de fuga.
 * MEMBER solo tiene permisos `:own`; el filtro por `userId` lo aplica el guard.
 * ADMIN recibe el catalogo completo por construccion.
 */
const MATRIX = {
  PROSPECT: ["financiamiento:read", "novedad:read:published"],
  MEMBER: [
    "expediente:read:own",
    "documento:read:own",
    "cuota:read:own",
    "financiamiento:read",
    "novedad:read:published",
  ],
  ADMIN: PERMISSIONS,
};

/**
 * Permisos que exigen licencia administrativa validada (step-up), ademas del rol.
 * Son las acciones destructivas, las que exponen credenciales y las que afectan a
 * la contabilidad o a la gestion de usuarios.
 */
export const STEP_UP_PERMISSIONS = [
  "expediente:delete",
  "documento:delete",
  "credencial:read",
  "credencial:rotate",
  "cuota:payment:revert",
  "financiamiento:write",
  "usuario:manage",
  "auditoria:read",
];

/** Normaliza un rol; devuelve null si no es valido (fail-closed). */
export function normalizeRole(value) {
  const role = String(value ?? "").trim().toUpperCase();

  return ROLES.includes(role) ? role : null;
}

export function isRole(value) {
  return normalizeRole(value) !== null;
}

/**
 * True si el rol tiene el permiso.
 * Fail-closed: un rol invalido, vacio o desconocido no tiene ningun permiso.
 */
export function can(role, permission) {
  const normalized = normalizeRole(role);

  if (!normalized) return false;

  const granted = MATRIX[normalized];

  return Array.isArray(granted) && granted.includes(permission);
}

/** True si el permiso exige licencia administrativa validada. */
export function requiresStepUp(permission) {
  return STEP_UP_PERMISSIONS.includes(permission);
}

/** Copia de los permisos de un rol (util para el panel y las pruebas). */
export function permissionsOf(role) {
  const normalized = normalizeRole(role);

  return normalized ? [...MATRIX[normalized]] : [];
}

/** True si el permiso existe en el catalogo. */
export function isPermission(value) {
  return PERMISSIONS.includes(value);
}
