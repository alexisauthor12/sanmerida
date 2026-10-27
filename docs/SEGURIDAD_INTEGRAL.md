---
title: Seguridad Integral SAN Merida
---

# Seguridad Integral SAN Merida

Diseno tecnico del sistema de seguridad. Es la **especificacion** que se
implementa por fases (seccion 11). Cada seccion indica el estado actual, el
estado objetivo y el cambio concreto por archivo.

> Estado: **propuesta para aprobacion**. No hay cambios de codigo aplicados.

## Indice

1. Principios y alcance
2. Modelo de identidad y roles
3. Sesion, revocacion y secretos
4. Matriz de permisos (RBAC)
5. Implementacion de la autorizacion
6. Auditoria (AuditLog)
7. Rate limiting y anti fuerza bruta
8. Endurecimiento por archivo
9. Cabeceras, transporte y almacenamiento
10. Datos personales y cumplimiento
11. Verificacion automatizada
12. Plan de implementacion por fases
13. Decisiones abiertas (requieren aprobacion)

---

## 1) Principios y alcance

Alcance: toda la superficie HTTP de la aplicacion (`src/app/api/**`), las paginas
protegidas, la base de datos PostgreSQL y el almacenamiento de expedientes
(Supabase Storage).

Principios de diseno:

1. **Fail-closed.** Si falta un secreto, un binding o una verificacion, la
   operacion se **deniega**. Nunca se asume un valor por defecto permisivo.
   (Hoy se incumple en `lib/auth.ts`: sin `AUTH_SECRET` cae a un secreto de
   desarrollo publico.)
2. **Menor privilegio.** Cada actor recibe el minimo necesario. El acceso a datos
   se decide por **rol**, no por la posesion de un secreto compartido.
3. **Un unico punto de verdad.** Toda decision de acceso pasa por un modulo
   central (`lib/authz.ts` + `lib/api-guard.ts`). Prohibido escribir
   comprobaciones de permisos ad-hoc en cada ruta.
4. **Todo nace cerrado.** Un endpoint nuevo es inaccesible hasta que se declara
   explicitamente su permiso o se marca como publico en una lista blanca.
5. **Trazabilidad total.** Todo acceso a datos personales queda auditado
   (quien, que, cuando, desde donde, con que resultado).
6. **Defensa en profundidad.** Rate limiting, cabeceras, revocacion de sesiones,
   TLS validado y 2FA se suman; ninguno se considera suficiente por si solo.
7. **Sin datos sensibles en claro** fuera de la base cifrada: ni en logs, ni en
   auditoria, ni en respuestas de error.

### Situacion actual (resumen del hallazgo)

| # | Riesgo | Severidad |
|---|---|---|
| A | `POST /api/auth/register` no exige sesion ni licencia: cualquiera crea una cuenta de equipo | Critica |
| B | `POST/GET /api/member-files/*` no exige licencia: cualquier cuenta de equipo lee/descarga/modifica/borra expedientes y documentos de **cualquier** cedula | Critica |
| C | `lib/auth.ts` cae a un secreto de desarrollo si `NODE_ENV !== "production"`: permite forjar tokens de administrador | Critica |
| D | `POST /api/auth/admin-direct-login` autentica solo con licencia (sin sesion previa), crea la cuenta admin si no existe y devuelve el error crudo de la base de datos | Alta |
| E | No existe rate limiting ni bloqueo por intentos en ningun endpoint de login | Alta |
| F | Conexiones PostgreSQL con `ssl.rejectUnauthorized: false` (sin validacion de certificado) | Alta |
| G | Sin cabeceras de seguridad globales (HSTS, CSP, X-Frame-Options, Referrer-Policy) | Media |
| H | Sin registro de auditoria de accesos a expedientes/documentos | Alta (cumplimiento) |
| I | JWT de 7 dias sin revocacion posible | Alta |
| J | Enumeracion de cedulas en `member-files/profile` | Media |
| K | Errores crudos de base de datos expuestos al cliente | Media |
| L | 28 vulnerabilidades en dependencias (2 criticas, 21 altas) | Media |

## 2) Modelo de identidad y roles

### 2.1 Actores

| Actor | Descripcion | Acceso esperado |
|---|---|---|
| **MEMBER** | Cliente con expediente. Entra por `/member-login` con `@usuario` + clave `SAN-MEMBER-XXXXXX` | Solo **su** expediente, sus cuotas, sus documentos y el feed publicado |
| **OPERATOR** | Personal de operacion (gestor de grupos, atencion). Cuenta de equipo **sin** licencia | Expedientes, documentos y cuotas de **todos** los miembros; **no** ve credenciales, **no** borra |
| **ADMIN** | Responsable del sistema. Requiere licencia administrativa validada | Todo, incluidas credenciales, borrado, financiamiento y auditoria |
| **SYSTEM** | Scripts y tareas programadas (seed, backups, purga) | Acceso por credenciales de proceso, nunca por sesion web |

Regla de negocio clave: **la licencia administrativa deja de ser el criterio de
acceso a los datos**. Pasa a ser un mecanismo de **step-up**: confirma una
accion critica dentro de una sesion ya autenticada (ver 5.4). El criterio de
acceso pasa a ser el **rol**.

### 2.2 Modelo de datos (objetivo)

```prisma
enum UserRole {
  MEMBER
  OPERATOR
  ADMIN
}

model User {
  id                String    @id @default(cuid())
  nombre            String
  apellido          String
  email             String    @unique
  telefono          String
  passwordHash      String

  // Rol efectivo del sistema (sustituye a isMember como fuente de verdad).
  role              UserRole  @default(OPERATOR)

  // Compatibilidad temporal con el codigo actual. Se mantiene sincronizado
  // con role durante la Fase 1 y se elimina en la Fase 2.
  isMember          Boolean   @default(false)

  // Revocacion de sesiones: el JWT lleva este valor; si no coincide con la
  // base de datos, la sesion se rechaza aunque la firma sea valida.
  tokenVersion      Int       @default(1)

  // Anti fuerza bruta y trazabilidad de acceso.
  failedLoginCount  Int       @default(0)
  lockedUntil       DateTime?
  lastLoginAt       DateTime?
  lastLoginIp       String?
  passwordChangedAt DateTime?

  // Segundo factor (Fase 3).
  totpSecret        String?
  totpEnabled       Boolean   @default(false)

  memberProfile     MemberProfile?
  auditLogs         AuditLog[]
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
}
```

### 2.3 Migracion de datos (sin romper produccion)

`prisma migrate` con script de backfill, en este orden:

1. Agregar la columna `role` con `@default(OPERATOR)` (no rompe nada).
2. Backfill:
   - `UPDATE "User" SET "role" = 'MEMBER'   WHERE "isMember" = true;`
   - `UPDATE "User" SET "role" = 'ADMIN'    WHERE "email" = $ADMIN_ACCOUNT_EMAIL;`
   - el resto queda `OPERATOR`.
3. Agregar `tokenVersion = 1`, contadores en 0 y `passwordChangedAt = "updatedAt"`.
4. El codigo nuevo lee **`role`**; `isMember` se sigue escribiendo por
   compatibilidad hasta la Fase 2.

> Nota: la asignacion de `ADMIN` por email es un paso **manual y auditado**. Se
> documenta en el runbook (`docs/OPERACIONES_PRODUCCION.md`).

---

## 3) Sesion, revocacion y secretos

### 3.1 Contenido del token

```ts
type SessionPayload = {
  sub: string;        // User.id
  email: string;
  nombre: string;
  role: "MEMBER" | "OPERATOR" | "ADMIN";
  tv: number;         // tokenVersion: revocacion
};
```

### 3.2 Reglas de sesion

| Regla | Actual | Objetivo |
|---|---|---|
| Duracion | 7 dias | **8 h** (equipo) / **12 h** (miembro), renovacion deslizante en actividad |
| Revocacion | No existe | `tokenVersion` verificado contra la base de datos en cada peticion |
| Verificacion de rol | El token guarda `isMember` | El token guarda `role`; el **rol autoritativo se re-lee** en acciones criticas |
| Cookie | `httpOnly`, `sameSite=lax`, `secure` en produccion | Igual, con `secure` **siempre** en produccion y prefijo `__Host-` |
| Logout | Borra la cookie | Borra la cookie **y** ofrece "cerrar todas las sesiones" (incrementa `tokenVersion`) |
| Cambio de contrasena | No invalida nada | Incrementa `tokenVersion` automaticamente |

`verifySessionToken` deja de ser suficiente por si solo: se agrega
`requireSession()` en `lib/api-guard.ts`, que valida firma **y** `tokenVersion`
**y** estado de la cuenta (no bloqueada, no deshabilitada).

### 3.3 Secretos

| Secreto | Uso | Cambio propuesto |
|---|---|---|
| `AUTH_SECRET` | Firma de los JWT de sesion y de licencia | **Fail-closed**: si falta, la aplicacion no arranca (incluso en desarrollo; en local se define en `.env.local`) |
| `MEMBER_KEY_ENCRYPTION_SECRET` | Clave AES-256-GCM de las credenciales de miembros | **Nuevo y separado** de `AUTH_SECRET`. Hoy son el mismo valor, por lo que rotar la firma destruye la capacidad de leer las claves de los miembros |
| `ADMIN_LICENSE_HASH` | bcrypt de la licencia administrativa | Sin cambios (coste 12 correcto) |
| `SUPABASE_SERVICE_ROLE_KEY` | Acceso al bucket privado | Sin cambios. Nunca al cliente |

**Migracion de la clave de cifrado** (necesaria si se separa el secreto): script
`scripts/rotate-member-key-secret.mjs` que, para cada `MemberProfile` con
`memberKeyCipher`, descifra con el secreto anterior y vuelve a cifrar con el
nuevo. Requiere ambos secretos presentes durante la ejecucion y es **idempotente**
(si el descifrado con el secreto nuevo ya funciona, no hace nada).

---

## 4) Matriz de permisos (RBAC)

### 4.1 Catalogo de permisos

Los permisos se nombran `recurso:accion[:alcance]`. El alcance `own` significa
"sobre el propio expediente"; `any` significa "sobre cualquier expediente".

```
expediente:read:own        expediente:read:any       expediente:create
expediente:update          expediente:delete
documento:read:own         documento:read:any        documento:upload
documento:scan             documento:delete
cuota:read:own             cuota:read:any            cuota:payment:register
cuota:payment:revert
credencial:read            credencial:rotate
financiamiento:read        financiamiento:write
novedad:read:published     novedad:read:any          novedad:write
grupo:read                 grupo:export
auditoria:read             usuario:manage
```

### 4.2 Matriz rol x permiso

| Permiso | MEMBER | OPERATOR | ADMIN |
|---|:--:|:--:|:--:|
| `expediente:read:own` | si | — | — |
| `expediente:read:any` | no | si | si |
| `expediente:create` | no | si | si |
| `expediente:update` | no | si | si |
| `expediente:delete` | no | **no** | si |
| `documento:read:own` | si | — | — |
| `documento:read:any` | no | si | si |
| `documento:upload` | no | si | si |
| `documento:scan` | no | si | si |
| `documento:delete` | no | **no** | si |
| `cuota:read:own` | si | — | — |
| `cuota:read:any` | no | si | si |
| `cuota:payment:register` | no | si | si |
| `cuota:payment:revert` | no | **no** | si |
| `credencial:read` | no | **no** | si |
| `credencial:rotate` | no | **no** | si |
| `financiamiento:read` | si | si | si |
| `financiamiento:write` | no | no | si |
| `novedad:read:published` | si | si | si |
| `novedad:read:any` (borradores) | no | si | si |
| `novedad:write` | no | si | si |
| `grupo:read` | no | si | si |
| `grupo:export` | no | si | si |
| `auditoria:read` | no | **no** | si |
| `usuario:manage` | no | no | si |

**Decisiones de negocio reflejadas aqui** (confirmar en la seccion 13):

- Un **OPERATOR** gestiona el dia a dia (expedientes, documentos, cuotas,
  novedades) pero **no puede destruir informacion** (borrar expedientes,
  documentos o revertir pagos) ni ver credenciales. Eso queda solo en ADMIN.
- Un **MEMBER** nunca ve datos de otro miembro, ni siquiera por error de
  implementacion: el filtro por `userId` forma parte del guard, no de la ruta.

### 4.3 Regla del propietario

El acceso `own` se resuelve siempre comparando
`MemberProfile.userId === session.userId`, **nunca** por la cedula que llega en la
peticion. Si el parametro `cedula` no corresponde al usuario de la sesion, se
responde `404` uniforme (no `403`), para no confirmar la existencia del
expediente.

### 4.4 Permisos que exigen step-up (licencia; 2FA en Fase 3)

| Permiso | Motivo |
|---|---|
| `expediente:delete` | Destruccion de informacion contractual |
| `documento:delete` | Destruccion de prueba documental |
| `credencial:read` / `credencial:rotate` | Las claves son reversibles (AES-GCM): verlas es un riesgo alto |
| `cuota:payment:revert` | Manipulacion de dinero |
| `financiamiento:write` | Afecta a todos los contratos nuevos |
| `usuario:manage` | Escalada de privilegios |
| `auditoria:read` | Contiene metadatos de todo el personal |

Con licencia ausente o expirada, estos permisos se deniegan con `403` y el
mensaje indica que se debe validar la licencia administrativa.

---

## 5) Implementacion de la autorizacion

### 5.1 `src/lib/authz.ts` (nuevo) — fuente unica de verdad

```ts
export const ROLES = ["MEMBER", "OPERATOR", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "expediente:read:own", "expediente:read:any", "expediente:create",
  "expediente:update", "expediente:delete",
  "documento:read:own", "documento:read:any", "documento:upload",
  "documento:scan", "documento:delete",
  "cuota:read:own", "cuota:read:any", "cuota:payment:register",
  "cuota:payment:revert",
  "credencial:read", "credencial:rotate",
  "financiamiento:read", "financiamiento:write",
  "novedad:read:published", "novedad:read:any", "novedad:write",
  "grupo:read", "grupo:export", "auditoria:read", "usuario:manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Permisos por rol. ADMIN recibe el catalogo completo por construccion. */
const MATRIX: Record<Role, readonly Permission[]> = {
  MEMBER: [
    "expediente:read:own", "documento:read:own", "cuota:read:own",
    "financiamiento:read", "novedad:read:published",
  ],
  OPERATOR: [
    "expediente:read:any", "expediente:create", "expediente:update",
    "documento:read:any", "documento:upload", "documento:scan",
    "cuota:read:any", "cuota:payment:register",
    "financiamiento:read", "novedad:read:published", "novedad:read:any",
    "novedad:write", "grupo:read", "grupo:export",
  ],
  ADMIN: PERMISSIONS,
};

/** Permisos que requieren licencia administrativa validada (step-up). */
export const STEP_UP_PERMISSIONS: readonly Permission[] = [
  "expediente:delete", "documento:delete", "credencial:read",
  "credencial:rotate", "cuota:payment:revert", "financiamiento:write",
  "usuario:manage", "auditoria:read",
];

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

export function requiresStepUp(permission: Permission): boolean {
  return STEP_UP_PERMISSIONS.includes(permission);
}
```

> `authz.ts` es **puro** (sin React ni base de datos) para poder probarlo, igual
> que `installment-schedule.mjs` o `noticias-feed.mjs`.

### 5.2 `src/lib/api-guard.ts` (nuevo) — unica puerta de entrada

```ts
type GuardResult =
  | { ok: true; user: SessionUser; profile?: MemberProfile }
  | { ok: false; response: NextResponse };

/** Sesion valida + permiso concedido. */
export async function requirePermission(
  permission: Permission,
  options?: { request?: Request; cedula?: string },
): Promise<GuardResult>;

/** Sesion valida sin permiso concreto (p. ej. /api/auth/session-status). */
export async function requireSession(): Promise<GuardResult>;

/** Rutas publicas: lista blanca EXPLICITA y auditada. */
export const PUBLIC_ROUTES = [
  "/api/auth/login",
  "/api/auth/logout",
] as const;
```

Secuencia de comprobacion:

1. Verifica el JWT con `AUTH_SECRET` (fail-closed si falta el secreto).
2. Re-lee de la base de datos `tokenVersion`, `role` y `lockedUntil`. Si
   `tv !== tokenVersion` → `401` y sesion revocada.
3. Evalua `can(role, permission)`.
4. Si el permiso esta en `STEP_UP_PERMISSIONS`, valida la licencia administrativa.
5. Si el permiso es de alcance `own`, resuelve y compara
   `MemberProfile.userId === session.userId`.
6. Registra el intento en auditoria (concedido o denegado).
7. Deniega con `403` **generico**, sin revelar el motivo real ni la existencia
   del recurso.

### 5.3 Regla de cobertura (que esto no vuelva a pasar)

Todo `route.ts` bajo `src/app/api/**` debe:

- llamar a `requirePermission(...)` o `requireSession()` en su primera linea, **o**
- figurar en `PUBLIC_ROUTES`.

No queda a la buena voluntad: una prueba automatica (seccion 11.2) recorre el
arbol de rutas y **falla** si aparece una ruta sin guard. Es el mecanismo que
garantiza que el hueco de `member-files` no pueda reabrirse con un endpoint nuevo.

### 5.4 Step-up: la licencia cambia de papel

| Hoy | Objetivo |
|---|---|
| La licencia **da acceso** a los datos (es el portero) | El **rol** da acceso; la licencia **confirma** acciones criticas |
| `admin-direct-login` autentica solo con licencia, sin sesion previa | **Se elimina**. Flujo unico: login normal + `POST /api/auth/admin-license` sobre una sesion ya iniciada |
| Duracion de la licencia: 24 h | 4 h, ligada al `tokenVersion` de la sesion |
| Sin limite de intentos | 3 intentos / 30 min por IP y por usuario, con bloqueo progresivo |
| La licencia se guarda en una cookie con `scope` | Igual, mas `tv` para que el logout global la invalide |

### 5.5 Errores: que se responde al cliente

| Situacion | Hoy | Objetivo |
|---|---|---|
| Fallo de base de datos | `"Error real de base de datos: " + error.message` | `"No se pudo completar la operacion. Intenta de nuevo."` (el detalle solo al log del servidor) |
| Recurso de otro miembro | `403` con mensaje explicito | `404` uniforme |
| Cedula inexistente | `found: false` + mensaje | Misma forma y mismo tiempo de respuesta que una existente |
| Falta licencia | `403` con motivo | `403` generico + indicacion de validar licencia (sin detalle tecnico) |

---

## 6) Auditoria (AuditLog)

### 6.1 Objetivo

Responder, en menos de un minuto y para cualquier expediente, a estas preguntas:

- Quien consulto o descargo este documento, y cuando.
- Quien modifico o borro este expediente o esta cuota.
- Desde que IP y con que navegador.
- Que se llevo cada cuenta en un periodo (volumen de descargas por usuario).
- Que intentos fallidos hubo (login, licencia) y desde donde.

Sin esto, ante una filtracion no hay forma de saber el alcance real. Con cedulas,
direcciones, selfies y geolocalizacion, es parte de la responsabilidad legal.

### 6.2 Modelo de datos

```prisma
enum AuditAction {
  LOGIN_SUCCESS
  LOGIN_FAILED
  LOGOUT
  SESSION_REVOKED
  ADMIN_LICENSE_SUCCESS
  ADMIN_LICENSE_FAILED
  EXPEDIENTE_READ
  EXPEDIENTE_CREATE
  EXPEDIENTE_UPDATE
  EXPEDIENTE_DELETE
  DOCUMENTO_READ
  DOCUMENTO_UPLOAD
  DOCUMENTO_SCAN
  DOCUMENTO_DELETE
  CREDENCIAL_READ
  CREDENCIAL_ROTATE
  CUOTA_PAYMENT_REGISTER
  CUOTA_PAYMENT_REVERT
  FINANCIAMIENTO_UPDATE
  NOVEDAD_CREATE
  NOVEDAD_UPDATE
  NOVEDAD_DELETE
  GRUPO_EXPORT
  RATE_LIMIT_BLOCK
}

model AuditLog {
  id          String      @id @default(cuid())
  action      AuditAction

  // Quien lo hizo. Se guarda el email "congelado" para que el registro siga
  // siendo legible aunque la cuenta se elimine despues.
  actorUserId String?
  actorEmail  String?
  actorRole   String?

  // Sobre que se hizo.
  targetType  String?     // "MemberProfile" | "MemberAsset" | "InstallmentPayment" | "NewsPost" | "User"
  targetId    String?
  targetLabel String?     // etiqueta ENMASCARADA: "V-***1234", titulo de la novedad

  // Detalle no sensible (nunca contenido de documentos, claves ni PII completa).
  metadata    Json?

  ip          String?
  userAgent   String?

  success     Boolean     @default(true)
  createdAt   DateTime    @default(now())

  @@index([createdAt])
  @@index([actorUserId, createdAt])
  @@index([targetType, targetId, createdAt])
  @@index([action, createdAt])
}
```

### 6.3 Reglas de registro

1. **Nunca** se guardan datos sensibles en claro: ni la cedula completa (se
   enmascara `V-***1234`), ni claves, ni tokens, ni contenido de documentos, ni
   coordenadas exactas.
2. Se audita **tanto el exito como la denegacion** (`success: false`), porque los
   intentos fallidos repetidos son la senal de alerta mas util.
3. Escritura **best-effort**: si la auditoria falla, la operacion principal no se
   rompe, pero el fallo se reporta al log del servidor. En Cloudflare Workers se
   usa `waitUntil` para no penalizar la latencia de la respuesta.
4. **Inmutable en la practica**: la aplicacion solo inserta. No hay endpoint de
   edicion ni de borrado individual. La limpieza se hace por retencion
   (seccion 6.4) y queda ella misma auditada.
5. La IP se toma de la cabecera `CF-Connecting-IP` (Cloudflare), con respaldo en
   `X-Forwarded-For`; nunca se confia en un valor enviado por el cliente sin
   validar.

### 6.4 Retencion y purga

| Tipo | Retencion | Mecanismo |
|---|---|---|
| Auditoria de accesos a expedientes/documentos | **2 anos** | `scripts/purge-audit-log.mjs --before <fecha> --apply` |
| Auditoria de login y licencia | 1 ano | idem |
| Registro de la propia purga | permanente (resumen) | se escribe un `AuditLog` con el conteo purgado |

La retencion se configura con `AUDIT_RETENTION_DAYS` para poder ajustarla sin
tocar codigo.

### 6.5 Consulta (panel admin)

Nueva pestana **Auditoria** en `/admin` (permiso `auditoria:read`, con step-up):

- Filtros: fecha (desde/hasta), actor, accion, expediente (cedula), resultado.
- Busqueda por cedula enmascarada o por titulo de novedad.
- Resumen por actor: cuantas lecturas, cuantas descargas, cuantos intentos
  fallidos en el periodo.
- **Alertas destacadas**: mas de N descargas del mismo expediente por la misma
  cuenta en 1 hora; accesos fuera de horario laboral; racha de intentos fallidos.
- Exportacion CSV (tambien auditada como `GRUPO_EXPORT` / `auditoria:read`).

### 6.6 Que se instrumenta por endpoint

| Endpoint | Acciones auditadas |
|---|---|
| `/api/auth/login` | `LOGIN_SUCCESS`, `LOGIN_FAILED`, `RATE_LIMIT_BLOCK` |
| `/api/auth/logout` | `LOGOUT` |
| `/api/auth/admin-license` | `ADMIN_LICENSE_SUCCESS`, `ADMIN_LICENSE_FAILED` |
| `/api/member-panel` | `EXPEDIENTE_READ` (propio o ajeno, con el actor) |
| `/api/member-files/profile` | `EXPEDIENTE_READ` |
| `/api/member-files/file` | `DOCUMENTO_READ` (con `targetLabel` = clave enmascarada) |
| `/api/member-files/upload` (POST) | `DOCUMENTO_UPLOAD` |
| `/api/member-files/upload` (DELETE) | `DOCUMENTO_DELETE` |
| `/api/member-files/scan` | `DOCUMENTO_SCAN` |
| `/api/monitor-cuotas` (GET) | `EXPEDIENTE_READ` / `CUOTA_PAYMENT_*` segun el caso |
| `/api/monitor-cuotas` (POST, `kind=credentials`) | `CREDENCIAL_ROTATE` |
| `/api/monitor-cuotas` (POST, pago/abono) | `CUOTA_PAYMENT_REGISTER` |
| `/api/monitor-cuotas` (DELETE) | `CUOTA_PAYMENT_REVERT` o `EXPEDIENTE_DELETE` |
| `/api/auth/register-member` | `EXPEDIENTE_CREATE` |
| `/api/financing-motos` (POST) | `FINANCIAMIENTO_UPDATE` |
| `/api/noticias` (POST/PATCH/DELETE) | `NOVEDAD_CREATE` / `NOVEDAD_UPDATE` / `NOVEDAD_DELETE` |
| `/dashboard/group-sheet` (exportacion) | `GRUPO_EXPORT` |

---

## 7) Rate limiting y anti fuerza bruta

### 7.1 Por que hace falta un backend externo

Cloudflare Workers no comparte memoria entre instancias: un contador en memoria no
sirve. El diseno usa **Cloudflare KV** con `expirationTtl` (se agrega el binding en
`wrangler.jsonc`). Alternativa si se prefiere consistencia fuerte: un Durable
Object; el KV es suficiente para contadores de ventana fija.

### 7.2 `src/lib/rate-limit.ts` (nuevo)

```ts
export type RateLimitRule = {
  key: string;            // "login:ip" | "login:user" | "license:ip" ...
  limit: number;          // peticiones permitidas
  windowSeconds: number;  // tamano de la ventana
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export async function checkRateLimit(rules: RateLimitRule[]): Promise<RateLimitResult>;
export async function resetRateLimit(key: string): Promise<void>;
```

- Clave por IP (`CF-Connecting-IP`) **y** por identidad (usuario/email), siempre
  ambas: la primera frena el ataque desde un origen; la segunda, el distribuido.
- Respuesta uniforme: `429` + cabecera `Retry-After`. El cuerpo **no** revela si
  la cuenta existe.
- En desarrollo (sin binding KV) se usa un `Map` en memoria con el mismo
  contrato, para poder probar el comportamiento localmente.

### 7.3 Limites por endpoint

| Endpoint | Por IP | Por cuenta | Ventana |
|---|---|---|---|
| `POST /api/auth/login` | 10 | 5 fallos | 15 min |
| `POST /api/auth/admin-license` | 5 | 3 fallos | 30 min |
| `POST /api/auth/register` | 3 | — | 1 h (si se mantiene abierto) |
| `POST /api/auth/register-member` | 30 | 15 | 1 h |
| `GET /api/member-files/file` | 300 | 120 | 5 min |
| `GET /api/member-files/profile` | 60 | 30 | 5 min |
| `POST /api/member-files/upload` / `scan` | 40 | 20 | 5 min |
| `DELETE /api/member-files/upload` | 20 | 10 | 5 min |
| `GET/POST/DELETE /api/monitor-cuotas` | 200 | 100 | 5 min |
| `POST/PATCH/DELETE /api/noticias` | 60 | 30 | 5 min |
| `POST /api/financing-motos` | 20 | 10 | 5 min |

El limite de `file` es el mas importante despues de los logins: evita que una
cuenta comprometida **raspe** el almacenamiento de documentos en minutos.

### 7.4 Bloqueo progresivo de cuenta

Ademas del limite por ventana, en la tabla `User`:

| Fallos consecutivos | Efecto |
|---|---|
| 5 | `lockedUntil = now + 15 min` |
| 10 | `lockedUntil = now + 1 h` |
| 20 | `lockedUntil = now + 24 h` y alerta al administrador |

- Un login correcto reinicia `failedLoginCount` y limpia `lockedUntil`.
- El mensaje de error es el mismo que con contrasena incorrecta (no se filtra si
  la cuenta esta bloqueada ni si existe).
- El desbloqueo manual se hace desde el panel admin (`usuario:manage`, auditado).
- Cada bloqueo escribe `RATE_LIMIT_BLOCK` en auditoria.

### 7.5 Politica de contrasenas (equipo)

| Regla | Valor |
|---|---|
| Longitud minima | 12 caracteres (hoy 8) |
| Complejidad | Al menos 3 de 4: minuscula, mayuscula, digito, simbolo |
| Lista negra | Contrasenas comunes y derivadas del nombre/correo del usuario |
| Reutilizacion | Se rechaza la contrasena actual al cambiarla |
| Almacenamiento | bcrypt coste 12 (ya correcto) |
| Cambio | Invalida todas las sesiones (`tokenVersion++`) |

La clave de miembro `SAN-MEMBER-XXXXXX` mantiene su formato por operativa, pero se
**refuerza** con: rate limiting dedicado, bloqueo progresivo, alerta al
administrador cuando se agota el 50% de los intentos y auditoria de cada intento.

---

## 8) Endurecimiento por archivo

Cambios concretos, en el orden de implementacion (Fase 0 primero).

### 8.1 Modulos nuevos

| Archivo | Contenido |
|---|---|
| `src/lib/authz.ts` | Catalogo de permisos, matriz por rol, `can()`, `requiresStepUp()` |
| `src/lib/api-guard.ts` | `requirePermission()`, `requireSession()`, `PUBLIC_ROUTES`, lectura de IP, auditoria integrada |
| `src/lib/audit.ts` | `recordAudit()`, enmascarado de cedula, extraccion de IP y user-agent |
| `src/lib/rate-limit.ts` | `checkRateLimit()` sobre KV, con respaldo en memoria para desarrollo |
| `src/lib/password-policy.mjs` | Validacion de contrasenas (puro y testeable) |

### 8.2 Modulos existentes

| Archivo | Cambio |
|---|---|
| `src/lib/auth.ts` | `getAuthSecret()` **fail-closed**; payload con `role` y `tv`; duracion 8 h / 12 h; cookie `secure` siempre en produccion |
| `src/lib/session.ts` | `getSessionUser()` valida `tokenVersion` y estado de la cuenta (no bloqueada) |
| `middleware.ts` | Extender la proteccion a `/api/**` como **segunda barrera** (ademas de la validacion de cada ruta) |

### 8.3 Rutas de autenticacion

| Archivo | Cambio |
|---|---|
| `api/auth/register/route.ts` | **Exige `usuario:manage`** o se retira la ruta publica (decision 13.1); politica de contrasena; error generico; TLS validado |
| `api/auth/login/route.ts` | Rate limit + bloqueo progresivo + auditoria; se elimina el fallback de credenciales de desarrollo |
| `api/auth/admin-license/route.ts` | Rate limit; licencia ligada al `tokenVersion`; duracion 4 h; auditoria |
| `api/auth/admin-direct-login/route.ts` | **Se elimina**: el flujo pasa a ser login + licencia sobre sesion ya iniciada |
| `api/auth/logout/route.ts` | Invalida `tokenVersion` en el cierre global; audita `LOGOUT` |
| `api/auth/session-status/route.ts` | `requireSession()`; deja de exponer detalles internos |

### 8.4 Rutas de expedientes y documentos (la fuga critica)

| Archivo | Cambio |
|---|---|
| `api/member-panel/route.ts` | `requirePermission("expediente:read:own")` o `("expediente:read:any")`; 404 uniforme; auditoria |
| `api/member-files/profile/route.ts` | `requirePermission("expediente:read:any")`; respuesta uniforme anti-enumeracion; auditoria |
| `api/member-files/file/route.ts` | `requirePermission("documento:read:own")` o `("documento:read:any")`; auditoria `DOCUMENTO_READ` |
| `api/member-files/upload/route.ts` | POST → `documento:upload`; DELETE → `documento:delete` (step-up); validacion por **magic bytes**; auditoria |
| `api/member-files/scan/route.ts` | `requirePermission("documento:scan")`; auditoria |

### 8.5 Resto de rutas

| Archivo | Cambio |
|---|---|
| `api/monitor-cuotas/route.ts` | Sustituye `ensureMonitorAccess()` por el guard; `cuota:payment:revert` y `expediente:delete` con step-up; credenciales solo ADMIN |
| `api/financing-motos/route.ts` | GET → `financiamiento:read`; POST → `financiamiento:write` (step-up) |
| `api/noticias/route.ts` | GET → `novedad:read:published` / `novedad:read:any`; escrituras → `novedad:write` |
| `api/auth/register-member/route.ts` | `requirePermission("expediente:create")`; deja de volcar datos personales en el log de errores |
| `api/dev/create-member-admin/route.ts` | Ya cerrado a desarrollo (mantener) |

### 8.6 Configuracion y despliegue

| Archivo | Cambio |
|---|---|
| `wrangler.jsonc` | Binding `RATE_LIMIT` (KV) y `AUDIT_RETENTION_DAYS` |
| `next.config.ts` | Cabeceras de seguridad globales (seccion 9.1) |
| `prisma/schema.prisma` | `UserRole`, campos nuevos de `User`, modelo `AuditLog` y enum `AuditAction` |
| `src/app/register/page.tsx` | Se retira o se protege segun la decision 13.1 |
| `docs/OPERACIONES_PRODUCCION.md` | Nuevas variables de entorno y checklist de seguridad |

### 8.7 Compatibilidad durante la migracion

- `isMember` se sigue **escribiendo** (derivado de `role`) durante la Fase 1, para
  que cualquier codigo o script no migrado siga funcionando.
- `ensureMonitorAccess()` y `tieneLicenciaAdmin()` se mantienen como envoltorios
  temporales que delegan en el guard nuevo, y se eliminan en la Fase 2.
- Los tokens emitidos antes del cambio **no** llevan `tv`: se tratan como
  `tv = 0` y se rechazan, forzando un nuevo login (efecto deseado: rotacion de
  sesiones al desplegar).

---

## 9) Cabeceras, transporte y almacenamiento

### 9.1 Cabeceras de seguridad globales

Se agregan en `next.config.ts` con `headers()`, aplicadas a todas las rutas:

| Cabecera | Valor | Para que |
|---|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Fuerza HTTPS y evita degradacion a HTTP |
| `X-Content-Type-Options` | `nosniff` | Evita que el navegador "adivine" el tipo de contenido |
| `X-Frame-Options` | `DENY` | Bloquea el clickjacking |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | No filtra rutas con cedulas a terceros |
| `Permissions-Policy` | `camera=(self), geolocation=(self), microphone=()` | Solo la app puede usar camara y ubicacion |
| `Content-Security-Policy` | Politica estricta con `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'` | Mitiga XSS e inyeccion |
| `Cross-Origin-Opener-Policy` | `same-origin` | Aisla el contexto de navegacion |
| `X-Permitted-Cross-Domain-Policies` | `none` | Evita politicas heredadas de Flash/PDF |

Consideraciones sobre la CSP:
- Leaflet y el escaneo de imagenes en el cliente necesitan `blob:` y `data:` en
  `img-src`, y `worker-src 'self' blob:` para tesseract.js.
- Los estilos de Tailwind requieren `style-src 'self' 'unsafe-inline'` (o un nonce
  gestionado por el middleware si se quiere endurecer mas).
- Se valida en modo `Content-Security-Policy-Report-Only` durante unos dias antes
  de activarla en firme, para detectar bloqueos no previstos.

### 9.2 Transporte y base de datos

| Punto | Hoy | Objetivo |
|---|---|---|
| Conexion a PostgreSQL | `ssl: { rejectUnauthorized: false }` en `register` y `admin-direct-login` | **Validacion de certificado activa**. En produccion se usa Hyperdrive (tunel interno); donde se use `DATABASE_URL` directo, `rejectUnauthorized: true` |
| Driver | `pg` directo en 2 rutas, Prisma en el resto | Todo por Prisma + Hyperdrive; se eliminan las conexiones ad-hoc |
| Secretos en logs | Se imprimen nombres de origen y hosts | Solo el origen (`HYPERDRIVE`/`DATABASE_URL`), nunca el host ni la cadena de conexion |
| Cookies | `secure` condicionado a `NODE_ENV` | `secure` **siempre** en produccion; `__Host-` en los nombres |

### 9.3 Almacenamiento de expedientes (ya solido, se refuerza)

Lo que ya esta bien y se conserva: bucket **privado**, entrega solo por
`/api/member-files/file` con sesion validada, `Cache-Control: no-store`,
`X-Content-Type-Options`, CSP propia en la respuesta, borrado no destructivo con
papelera de 30 dias y `_papelera` fuera de las claves servibles.

Refuerzos:

| Refuerzo | Detalle |
|---|---|
| Validacion por **magic bytes** | No basta la extension ni el `Content-Type` declarado por el cliente: se inspeccionan los primeros bytes para confirmar que es JPEG/PNG/WebP/PDF real |
| Limite de tamano por documento | Ya existe (20 MB): se mantiene y se valida **tambien** en el servidor, no solo en el cliente |
| Rechazo de archivos poliglotas | Un archivo que sea a la vez imagen y PDF/HTML se rechaza |
| Nombres de archivo | Se normalizan y se generan con token aleatorio (ya implementado): se mantiene |
| Antivirus | Fase 2: escaneo opcional (ClamAV en un Worker externo o servicio gestionado) antes de publicar el objeto |

---

## 10) Datos personales y cumplimiento

### 10.1 Datos tratados

| Dato | Sensibilidad | Donde vive |
|---|---|---|
| Cedula, RIF | Alta | `MemberProfile`, documentos en bucket privado |
| Imagen de la cedula, selfie | **Muy alta** (biometria) | Bucket privado |
| Direccion, coordenadas GPS, referencias | Alta | `MemberProfile` |
| Telefono, correo | Media | `User`, `MemberProfile` |
| Datos financieros (cuotas, pagos, montos) | Alta | `InstallmentPayment`, `AdvancePayment` |
| Contratos | Alta | Bucket privado |
| Credenciales de miembro (clave SAN) | **Muy alta** (reversibles) | `MemberProfile.memberKeyCipher` |

### 10.2 Principios aplicados

1. **Minimizacion.** `member-files/profile` deja de devolver el expediente completo
   por defecto. Se separa en dos respuestas: `summary` (lo que necesita la lista de
   trabajo) y `full` (permiso `expediente:read:any` + auditoria).
2. **Finalidad.** Cada permiso declara para que existe; no hay permisos "por si
   acaso".
3. **Retencion.** Papelera 30 dias (ya existe); auditoria 1-2 anos; expedientes
   inactivos: politica a definir con el negocio (seccion 13).
4. **Confidencialidad.** Cifrado en transito (TLS validado) y en reposo (bucket y
   base de datos gestionados por Supabase); PII sensible a nivel de columna en la
   Fase 3.
5. **Integridad.** Borrado no destructivo, auditoria inmutable, y registro de la
   rotacion de credenciales.
6. **Consentimiento y aviso.** El formulario de registro de miembros incorpora el
   aviso de tratamiento de datos y el consentimiento explicito (texto a revisar
   por el responsable legal).
7. **Derecho de acceso y rectificacion.** El miembro ya ve su expediente en
   `/dashboard`; se agrega la posibilidad de solicitar correccion (queda auditado).
8. **Notificacion de brechas.** Procedimiento documentado en el runbook: deteccion,
   contencion, evaluacion del alcance **usando la auditoria**, notificacion y
   medidas correctivas.

---

## 11) Verificacion automatizada

Una politica sin pruebas es una intencion. Estas pruebas son parte de la entrega,
no un extra.

### 11.1 `tests/authz.test.mjs` — matriz de permisos

- Para **cada** rol y **cada** permiso, verifica el resultado esperado de `can()`.
  La tabla del test es la transcripcion literal de la matriz de la seccion 4.2.
- Verifica que `ADMIN` tenga el catalogo completo.
- Verifica que `MEMBER` **no** tenga ninguno de los permisos `:any` ni de escritura.
- Verifica que `OPERATOR` no tenga `expediente:delete`, `documento:delete`,
  `credencial:read`, `cuota:payment:revert`, `usuario:manage` ni `auditoria:read`.
- Verifica que todo permiso de `STEP_UP_PERMISSIONS` pertenezca al catalogo y que
  **ningun** permiso de `MEMBER` lo requiera.

### 11.2 `tests/api-guard-coverage.test.mjs` — la prueba mas importante

Recorre `src/app/api/**/route.ts` y, para cada archivo:

1. Comprueba que importe `requirePermission` o `requireSession` de
   `@/lib/api-guard`.
2. Comprueba que el **primer** `export async function` del archivo llame al guard.
3. Si no lo cumple, el archivo debe figurar en `PUBLIC_ROUTES`.

Si aparece una ruta sin guard, **la prueba falla** y el despliegue se bloquea. Este
es el mecanismo que impide que el hueco de `/api/member-files/*` se repita.

### 11.3 `tests/rate-limit.test.mjs`

- Ventana fija: los primeros N pasan, el N+1 devuelve `allowed: false`.
- `retryAfterSeconds` es coherente con la ventana.
- Claves distintas no se contaminan entre si (IP vs cuenta).
- El respaldo en memoria se comporta igual que el KV.

### 11.4 `tests/security-config.test.mjs`

- `getAuthSecret()` **lanza** si falta `AUTH_SECRET` (sin importar `NODE_ENV`).
- El payload de sesion incluye `role` y `tv`.
- Las cabeceras de seguridad estan presentes en la configuracion de Next.
- `authz.ts` no importa nada de React ni de la base de datos (pureza del modulo).

### 11.5 `tests/audit.test.mjs`

- El enmascarado de cedula no deja ver mas de los ultimos 4 digitos.
- Un fallo de escritura de auditoria **no** propaga error a la operacion principal.
- Los metadatos rechazan claves sensibles conocidas (`password`, `memberKey`,
  `token`, `cipher`).

### 11.6 Prueba de intrusion guiada (manual, antes de cada release mayor)

Lista de casos que se ejecutan a mano contra el entorno de produccion, con el
resultado esperado:

| # | Caso | Esperado |
|---|---|---|
| 1 | `POST /api/auth/register` sin sesion | `401`/`403` |
| 2 | Cuenta de equipo sin licencia pide `member-files/profile` de otra cedula | `403` |
| 3 | Cuenta de equipo sin licencia pide `member-files/file` de un documento ajeno | `403` |
| 4 | Miembro pide el documento de otro miembro | `404` |
| 5 | Token firmado con un secreto distinto | `401` |
| 6 | Token valido tras "cerrar todas las sesiones" | `401` |
| 7 | 6 intentos fallidos de login seguidos | `429` y cuenta bloqueada |
| 8 | `member-files/profile` con cedula inexistente vs. existente | misma forma y tiempo de respuesta |
| 9 | Errores de base de datos | sin detalle interno en la respuesta |
| 10 | OPERATOR intenta borrar un documento | `403` |
| 11 | OPERATOR intenta leer credenciales | `403` |
| 12 | `POST /api/auth/admin-direct-login` | `404` (ruta eliminada) |
| 13 | Descarga masiva de documentos (mas de 120 en 5 min) | `429` |

---

## 12) Plan de implementacion por fases

Cada fase termina con `npx tsc --noEmit`, `npx eslint .`, `npm run test` y
`npm run build:web` en verde, mas un commit propio y reversible.

### Fase 0 — Contencion (bloquea las fugas activas)

| Paso | Entrega | Commit |
|---|---|---|
| 0.1 | `lib/authz.ts` + `tests/authz.test.mjs` (matriz completa) | `Seguridad: matriz de permisos por rol` |
| 0.2 | `getAuthSecret()` fail-closed + `role`/`tv` en el token | `Seguridad: secreto de firma fail-closed` |
| 0.3 | `lib/api-guard.ts` + `lib/audit.ts` + `tests/api-guard-coverage.test.mjs` | `Seguridad: guard unico de autorizacion y cobertura de rutas` |
| 0.4 | `/api/member-files/*` y `/api/member-panel` pasan por el guard (**cierra la fuga critica**) | `Seguridad: cerrar acceso a expedientes y documentos` |
| 0.5 | `/api/auth/register` protegido; `/register` retirado o restringido | `Seguridad: cerrar el auto-registro de cuentas de equipo` |
| 0.6 | `admin-direct-login` eliminado | `Seguridad: eliminar la ruta de login administrativo directo` |
| 0.7 | `lib/rate-limit.ts` + limites en los endpoints de login | `Seguridad: rate limiting y bloqueo progresivo` |
| 0.8 | TLS validado; errores genericos; sin PII en logs | `Seguridad: TLS validado y errores sin detalle interno` |

> La Fase 0 es la que convierte el sistema en "no vulnerable de forma trivial". Se
> puede desplegar el mismo dia, paso a paso.

### Fase 1 — Blindaje estructural

| Paso | Entrega | Commit |
|---|---|---|
| 1.1 | Migracion Prisma (`UserRole`, campos de `User`, `AuditLog`) + backfill | `Seguridad: roles y auditoria en base de datos` |
| 1.2 | Instrumentacion de auditoria en todas las rutas de la seccion 6.6 | `Seguridad: auditoria de accesos a expedientes` |
| 1.3 | Revocacion de sesiones (`tokenVersion`) + "cerrar todas las sesiones" | `Seguridad: revocacion de sesiones` |
| 1.4 | Cabeceras de seguridad globales (primero `Report-Only`, luego firme) | `Seguridad: cabeceras de seguridad globales` |
| 1.5 | Anti-enumeracion y respuestas uniformes | `Seguridad: respuestas uniformes anti-enumeracion` |
| 1.6 | Politica de contrasenas + `lib/password-policy.mjs` + pruebas | `Seguridad: politica de contrasenas` |
| 1.7 | Panel de auditoria en `/admin` (permiso `auditoria:read`) | `Admin: panel de auditoria` |

### Fase 2 — Operacion y cumplimiento

| Paso | Entrega |
|---|---|
| 2.1 | `npm audit` + parcheo de las 2 criticas y 21 altas |
| 2.2 | Validacion por magic bytes en las subidas |
| 2.3 | Backups cifrados + prueba de restauracion documentada |
| 2.4 | Alertas: descargas masivas, intentos fallidos, accesos fuera de horario |
| 2.5 | Purga por retencion (`scripts/purge-audit-log.mjs`) |
| 2.6 | Actualizacion de `docs/OPERACIONES_PRODUCCION.md`: variables, checklist y procedimiento de incidentes |
| 2.7 | Aviso de tratamiento de datos y consentimiento en el registro de miembros |

### Fase 3 — Defensa en profundidad

| Paso | Entrega |
|---|---|
| 3.1 | 2FA (TOTP) obligatorio para ADMIN |
| 3.2 | Cloudflare WAF + Access delante de `/admin` |
| 3.3 | Cifrado a nivel de columna para PII sensible |
| 3.4 | Separacion de `AUTH_SECRET` y `MEMBER_KEY_ENCRYPTION_SECRET` + script de rotacion |
| 3.5 | Rotacion periodica de secretos y de la licencia administrativa (runbook) |

---

## 13) Decisiones abiertas (necesito tu aprobacion)

Estas decisiones cambian el alcance del trabajo. Estan ordenadas por impacto.

### 13.1 Que hacemos con el auto-registro de cuentas de equipo

Hoy cualquiera se crea una cuenta de equipo desde `/register`, y esa cuenta es la
puerta de entrada a los expedientes.

- **Opcion A (recomendada):** se retira `/register` del sitio publico. Las cuentas
  de equipo solo las crea un ADMIN desde el panel (permiso `usuario:manage`).
- **Opcion B:** se mantiene la pagina, pero la cuenta nace **inactiva** y un ADMIN
  la aprueba y le asigna el rol.
- **Opcion C:** se mantiene abierta y solo se protege con rate limiting y
  verificacion de correo.

### 13.2 Puede un OPERATOR borrar informacion

Propongo que **no**: borrar expedientes, documentos o revertir pagos queda solo en
ADMIN con step-up. Si en la operacion diaria necesitan borrar, se agrega un flujo de
"solicitud de borrado" que un ADMIN aprueba (y queda auditado).

### 13.3 Licencia administrativa: se mantiene o se sustituye

- **Opcion A (recomendada):** se mantiene como **step-up** para las acciones
  criticas, se acorta a 4 h y se le agrega 2FA en la Fase 3.
- **Opcion B:** se elimina la licencia y el control queda 100% en el rol + 2FA.

### 13.4 Clave de miembro: se sigue pudiendo leer en claro

Hoy el ADMIN puede ver la clave `SAN-MEMBER-XXXXXX` del miembro (cifrado reversible).
Es una decision de negocio: **facilita el soporte**, pero significa que la clave es
recuperable por quien tenga `AUTH_SECRET` y el permiso.

- **Opcion A (recomendada):** se mantiene, pero con `credencial:read` (solo ADMIN),
  step-up, auditoria de cada lectura y rotacion facil.
- **Opcion B:** se vuelve **irreversible** (solo bcrypt). Si el miembro pierde la
  clave, se le emite una nueva. Mas seguro, menos comodo para soporte.

### 13.5 Retencion

- Auditoria de accesos: propongo **2 anos**.
- Expedientes de miembros inactivos: hay que decidir con el negocio (se conservan
  indefinidamente o se archivan a los N anos).

### 13.6 Alcance del rate limiting

- **Opcion A (recomendada):** KV (rapido de implementar, suficiente).
- **Opcion B:** Durable Object (consistencia fuerte, mas trabajo).

### 13.7 Separacion de secretos

Separar `AUTH_SECRET` de la clave de cifrado de miembros obliga a **re-cifrar** las
claves existentes con un script que necesita el secreto anterior. Se puede hacer sin
cortar el servicio, pero requiere ventana de mantenimiento y respaldo previo.
¿Se autoriza?

---

## 14) Resumen ejecutivo

| Pregunta | Respuesta |
|---|---|
| ¿El sistema esta blindado hoy? | **No.** Hay una via directa de fuga de expedientes y documentos por parte de cualquiera que se registre. |
| ¿Cual es el cambio mas urgente? | Cerrar `/api/member-files/*` con el guard por rol y cerrar el auto-registro de equipo (pasos 0.3 a 0.5). |
| ¿Cuanto cuesta dejarlo defendible? | **Fase 0**: una sesion de trabajo. Con eso se cierra la exposicion critica. |
| ¿Cuanto cuesta dejarlo "nivel empresa"? | **Fases 0 + 1**: roles, auditoria, revocacion de sesiones, cabeceras y panel de auditoria. |
| ¿Que aporta mas valor a largo plazo? | La **auditoria** y la **prueba de cobertura de guard**: convierten la seguridad en algo verificable, no en buena voluntad. |
| ¿Que NO hay que tocar? | Bucket privado, entrega de documentos por endpoint autenticado, cifrado AES-256-GCM de credenciales, bcrypt coste 12, consultas parametrizadas, papelera no destructiva y `.gitignore`. Esa base esta bien resuelta. |
