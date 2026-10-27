/**
 * Declaracion de tipos del modulo puro `authz.mjs`.
 *
 * Existe para que las rutas y el guard tengan comprobacion de tipos en tiempo de
 * compilacion: un permiso mal escrito se detecta con `tsc`, no en produccion.
 */

export type Role = "PROSPECT" | "MEMBER" | "ADMIN";

export type Permission =
  | "expediente:read:own"
  | "expediente:read:any"
  | "expediente:create"
  | "expediente:update"
  | "expediente:delete"
  | "documento:read:own"
  | "documento:read:any"
  | "documento:upload"
  | "documento:scan"
  | "documento:delete"
  | "cuota:read:own"
  | "cuota:read:any"
  | "cuota:payment:register"
  | "cuota:payment:revert"
  | "credencial:read"
  | "credencial:rotate"
  | "financiamiento:read"
  | "financiamiento:write"
  | "novedad:read:published"
  | "novedad:read:any"
  | "novedad:write"
  | "grupo:read"
  | "grupo:export"
  | "auditoria:read"
  | "usuario:manage";

export const ROLES: readonly Role[];
export const ROLE_DESCRIPTIONS: Record<Role, string>;
export const PERMISSIONS: readonly Permission[];
export const STEP_UP_PERMISSIONS: readonly Permission[];

export function normalizeRole(value: unknown): Role | null;
export function isRole(value: unknown): boolean;
export function can(role: unknown, permission: string): boolean;
export function requiresStepUp(permission: string): boolean;
export function permissionsOf(role: unknown): Permission[];
export function isPermission(value: unknown): value is Permission;
