---
title: Operaciones de Produccion SAN Merida
---

## 1) Variables de entorno obligatorias

Configura estas variables en tu plataforma de despliegue (no en el repositorio):

```bash
AUTH_SECRET="reemplazar-por-secreto-largo-y-unico"
DATABASE_URL="postgresql://usuario:password@host:5432/sanmerida?schema=public"
ADMIN_USERNAME="@admin"
ADMIN_LICENSE_HASH="$2b$12$REEMPLAZAR_CON_HASH_BCRYPT"
RESET_ACCOUNT_PASSWORD="solo-para-seed-manual"
NODE_ENV="production"
```

Notas:
- `DATABASE_URL` debe apuntar a Postgres productivo con TLS según proveedor. Con Supabase,
  define ademas `DATABASE_CA_CERT` (seccion 9.9): su pooler **no** valida contra la CA de
  Node, y sin ese archivo los scripts fallan al conectar.
- `ADMIN_LICENSE_HASH` debe ser bcrypt valido (`$2a$`, `$2b$`, `$2y$`).
- Rota `AUTH_SECRET` y `ADMIN_LICENSE_HASH` ante incidentes o cambios de personal.
- `AUTH_SECRET` firma las sesiones (JWT) y ademas deriva la clave AES-256-GCM con
  la que se cifran las credenciales de los miembros en el expediente. **Si cambia
  `AUTH_SECRET`, las credenciales guardadas dejan de poder descifrarse** (se
  vuelven a generar desde el panel) y todas las sesiones se invalidan.

> Aviso local: en `.env.local` un hash bcrypt debe ir como variable de entorno
> real (no solo en el archivo), porque Next expande los `$` al leer `.env*` y el
> hash llega corrupto al servidor ("ADMIN_LICENSE_HASH no tiene formato bcrypt
> valido"). En produccion esto no aplica: los secretos del Worker no pasan por
> ese mecanismo.
>
> Hallazgo adicional: `opennextjs-cloudflare` tambien hornea los valores de
> `.dev.vars` en `.open-next/cloudflare/next-env.mjs`, y ahi el hash llega
> **truncado** (se ve con menos de 60 caracteres). El Worker en produccion usa el
> **secreto real** (`wrangler secret put`), por eso el login de admin funciona
> igual. Consecuencia practica: **rotar la licencia requiere dos pasos**:
>
> 1. `node scripts/set-admin-license.mjs "NUEVA-LICENCIA"` (actualiza `.env.local`
>    y `.dev.vars`).
> 2. Publicar el hash en Cloudflare: `npx wrangler secret bulk <archivo.json>` con
>    `{"ADMIN_LICENSE_HASH":"<hash>"}`, o `npx wrangler secret put
>    ADMIN_LICENSE_HASH`, y luego `node scripts/deploy-cf.mjs`.
>
> El hash bcrypt de la licencia **no se puede revertir**: si se pierde la licencia
> en claro, hay que rotarla (no se recupera del hash).

### 1.6.bis) Datos de acceso del administrador

- **Usuario admin**: `ADMIN_USERNAME` (en desarrollo por defecto `san-root-x9`).
- **Cuenta admin**: `ADMIN_ACCOUNT_EMAIL` (por defecto `admin@sanmerida.com`).
- **Licencia**: valor en claro que **no se guarda en ningun archivo**; en
  produccion solo existe su hash bcrypt. Guardarla en el gestor de claves del
  responsable (nunca en el chat ni en el repositorio).
- Si se pierde la licencia, **no se puede recuperar**: hay que rotarla con los dos
  pasos descritos arriba.

### 1.1) Almacenamiento de expedientes (Supabase Storage)

Los documentos y contratos de los miembros (cedula, RIF, selfie, contratos) NO
se guardan en el repositorio ni en `public/`: viven en un bucket **privado** y
solo se entregan por el endpoint autenticado `/api/member-files/file`.

```bash
SUPABASE_URL="https://<proyecto>.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
SUPABASE_STORAGE_BUCKET="member-documents"
```

Notas:
- `SUPABASE_SERVICE_ROLE_KEY` es **secreta**: solo se usa en el servidor (nunca
  en el cliente).
- El bucket debe ser **privado** (sin politicas de lectura publica). La
  aplicacion no usa URLs publicas: lee los objetos con la service role key y los
  reenvia al cliente con sesion validada.
- Si `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` no estan definidos, la app cae
  al modo local (escribe en `public/uploads`), valido solo para desarrollo.
- `public/uploads/` esta ignorado por Git: los expedientes reales nunca se
  versionan.

Creacion del bucket (una sola vez):

```bash
# Con Supabase CLI o desde el panel: Storage > New bucket > privado
# Nombre: member-documents  (o el valor de SUPABASE_STORAGE_BUCKET)
```

### 1.2) Migrar expedientes existentes de `public/uploads` al bucket

```bash
# 1) Simulacion (no escribe nada)
node scripts/migrate-uploads-to-storage.mjs

# 2) Aplicar: sube los archivos y normaliza MemberAsset.filePath
node scripts/migrate-uploads-to-storage.mjs --apply
```

El script sube cada archivo local con la misma clave (`uploads/members/...`),
incluye los derivados del escaneo (`.pdf` y `.txt`) y normaliza las filas
antiguas que guardaban la ruta con slash inicial.

### 1.3) Dejar de versionar `public/uploads`

```bash
git rm -r --cached public/uploads
git commit -m "Dejar de versionar expedientes de miembros"
```

Los archivos siguen en disco (solo se quitan del indice). Tras migrarlos al
bucket se pueden borrar localmente.

### 1.4) Blindaje de los documentos

Capas de proteccion activas:

1. **Bucket privado** (`member-documents`): sin politicas de lectura publica.
   Los archivos nunca se sirven con URL publica.
2. **Limites en el propio bucket** (Supabase rechaza lo que no cumpla, aunque la
   app tuviera un fallo): maximo **20 MB** por archivo y solo estos tipos:
   `image/jpeg`, `image/png`, `image/webp`, `image/bmp`, `image/tiff`,
   `image/heic`, `image/heif`, `application/pdf`.
   Para (re)aplicarlos: `node scripts/setup-supabase-storage.mjs`
3. **Validacion en la app**: `/api/member-files/upload` rechaza formatos no
   permitidos (por ejemplo `.exe`, `.html`, `.svg`) y archivos grandes.
4. **Entrega solo con sesion**: `/api/member-files/file` responde `401` sin
   sesion; un miembro solo puede leer su propio expediente. Ademas envia
   `X-Content-Type-Options: nosniff`, `Content-Security-Policy` restrictiva y
   `Cache-Control: no-store` (un documento borrado no se sirve desde cache).
5. **Papelera**: al borrar o reemplazar un documento, el archivo se mueve a
   `_papelera/<fecha>/...` en lugar de destruirse. Se puede recuperar desde el
   panel de Supabase.

Notas de seguridad:
- La `SUPABASE_SERVICE_ROLE_KEY` es **secreta** (solo servidor) y vive como
  secreto del Worker de Cloudflare. **Rotarla** si se comparte por un canal
  inseguro (chat, correo) o al cambiar de personal.
- Los documentos NO se versionan en Git (`public/uploads/` esta ignorado).

### 1.5) Respaldo y verificacion de documentos

```bash
# Respaldo completo (documentos + manifiesto con las filas de la BD)
node scripts/backup-documents.mjs
node scripts/backup-documents.mjs D:\respaldos\sanmerida   # carpeta concreta

# ¿Falta algun documento? (comparara base de datos contra el bucket)
node scripts/check-storage-integrity.mjs

# Vaciar la papelera de lo eliminado hace mas de 30 dias
node scripts/purge-trash.mjs              # simulacion
node scripts/purge-trash.mjs --apply      # aplica
```

Recomendaciones:
- Ejecutar el respaldo **cada semana** y guardar la carpeta en la nube
  (Drive/OneDrive) o en un disco externo. `backups/` esta ignorado por Git.
- Ejecutar `check-storage-integrity.mjs` despues de cada respaldo: si reporta
  `Documentos FALTANTES`, restaurar desde el ultimo respaldo.
- La papelera conserva lo eliminado 30 dias por defecto (configurable).

### 1.6) Credenciales de los miembros en el expediente

Cada miembro tiene un usuario (`@nombre-apellido`) y una clave
`SAN-MEMBER-XXXXXX`. Al registrar el expediente la clave se guarda:

1. **Hasheada con bcrypt** en `User.passwordHash` (es lo que valida el login).
2. **Cifrada con AES-256-GCM** en `MemberProfile.memberKeyCipher`, para que el
   administrador pueda consultarla despues.

Reglas de operacion:

- La clave solo se descifra cuando la peticion tiene **licencia administrativa
  valida** (`/api/monitor-cuotas`). Un miembro nunca la ve.
- Para verla: **Panel admin > Monitor de cuotas > buscar la cedula > Expediente**.
  Aparece la tarjeta "Credenciales de acceso" con usuario, clave y boton *Copiar*.
- Si el miembro se registro **antes** de este cambio, su clave no esta guardada:
  el expediente mostrara "Sin credencial guardada". El boton
  **"Generar credenciales"** crea una clave nueva, la guarda y actualiza el acceso
  del miembro (la anterior deja de funcionar).
- Los cambios de esquema se aplican con `npx prisma db push`. Con Supabase usar el
  **pooler de sesion (puerto 5432)**: el de transacciones (6543) bloquea el DDL.

### 1.7) Videos del sitio y limite de assets de Cloudflare

Cloudflare Workers acepta **maximo 25 MiB por archivo** de assets.

**Los videos del carrusel se sirven comprimidos en MP4.** Los originales son
`.MOV` de 72 a 133 MiB: no se pueden subir como assets y ademas no se reproducen
en todos los navegadores (Chrome/Android). Por eso:

- `scripts/compress-catalog-videos.mjs` genera los `.mp4` que usa el sitio
  (H.264 + AAC, alto maximo 1280 px, `-crf 30` con reintentos mas agresivos hasta
  bajar de 24 MiB). Si el `.mp4` ya existia, lo guarda antes en
  `storage-videos/descarte/`.
- `src/app/page.tsx` (`videosCatalogo`) apunta siempre a esos `.mp4`.
- `tests/catalog-videos.test.mjs` verifica que cada video del catalogo exista,
  sea `.mp4` y pese menos de 25 MiB: si alguien vuelve a poner un archivo grande,
  la prueba falla antes del despliegue.
- Los `.MOV` originales se conservan en `public/` (el despliegue los omite con
  `.assetsignore`) y en `storage-videos/`: no se pierden.

`scripts/exclude-large-assets.mjs` (parte de `npm run build:cf`) sigue escribiendo
`.open-next/assets/.assetsignore` con todo archivo mayor a 25 MiB, para que el
despliegue no falle con `Asset too large`.

> Rendimiento: los videos que superan el limite de 25 MiB (los `.MOV` originales y
> `videocarru1.*`, ~700 MB) **ya no estan en `public/`**: viven en
> `storage-videos/originales/` (carpeta local ignorada por Git; siguen en el
> historial de Git/LFS). `public/` quedo en ~120 MB y el build baja de ~13 min a
> ~3-4 min. Para rehacer un video comprimido, copiar el original de vuelta a
> `public/` y ejecutar `scripts/compress-catalog-videos.mjs`.

### 1.8) Financiamiento por modelo de moto (50% inicial + cuotas quincenales)

Tercer plan de venta, ademas del de 26 y 83 cuotas:

- **Inicial**: porcentaje configurable por modelo (50% por defecto).
- **Pago**: cuotas cada **15 dias** (quincenal).
- **Duracion y monto**: se configuran **por modelo de moto** y los define el
  administrador a mano (control total).

Donde se administra:

- **Panel admin > "Financiamiento por modelo"**: tabla editable con precio base,
  % inicial, nº de cuotas quincenales y monto por cuota de cada modelo. Muestra
  en vivo el inicial, el saldo y la cuota sugerida (saldo ÷ cuotas) y avisa si el
  monto manual cobra mas o menos que el saldo.
- **Registro de miembro**: al elegir el plan *"Financiamiento 50% (quincenal)"* se
  carga sola la configuracion del modelo elegido (inicial, nº de cuotas, monto y
  duracion) y se muestra el desglose antes de guardar.
- **Monitor de cuotas**: el plan se cuenta cada 15 dias con el nº de cuotas
  guardado en el expediente (`MemberProfile.installmentCount`).

Datos: `MotoFinancing` (configuracion por modelo) y `MemberProfile.installmentCount`
(nº de cuotas del plan contratado). Se aplican con `npx prisma db push`.

**Los financiados son individuales**: no pertenecen a ningun grupo operativo.

### 1.9) Panel del miembro (`/dashboard`)

Cuando inicia sesion un usuario con `isMember = true`, `/dashboard` muestra su
propio panel con datos reales (antes era una maqueta con cifras de ejemplo):

- **Resumen**: cuotas pagadas / pendientes / vencidas, saldo pendiente, avance del
  plan, proxima cuota (con recargo por mora si aplica), su moto, su plan y su
  ubicacion registrada.
- **Mis cuotas**: calendario completo con numero, vencimiento, monto, recargo y
  estado (Pagada / Vencida / Por vencer / Pendiente).
- **Mis pagos**: pagos de cuotas y abonos registrados (fecha, banco, metodo,
  referencia).
- **Documentos**: un registro por tipo (cedula, RIF, licencia, certificado de
  origen, selfie) y los contratos, con enlace al endpoint protegido.
- **Mis datos**: nombre, cedula, correo, telefono, ocupacion, empresa, direccion.

Como funciona:

- Endpoint **`GET /api/member-panel`**: devuelve **solo** el expediente del propio
  miembro autenticado. El personal administrativo puede consultar un expediente
  concreto con `?cedula=` y su licencia validada (403 sin licencia).
- Los calculos de cuotas salen de **`src/lib/installment-schedule.mjs`**, el mismo
  modulo que usa el monitor de cuotas del panel admin: asi las cifras del miembro

### 1.10) Feed de novedades (noticias y videos) para los miembros

El miembro ve en su panel la pestaña **Novedades**: las publicaciones que hace el
equipo (noticias, promociones, avisos) y los videos de la empresa.

Donde se administra:

- **Panel admin > "Novedades"**: formulario para publicar (titulo, categoria,
  resumen, contenido completo, imagen y video opcionales, destacada, publicada) y
  lista de publicaciones con *Editar*, *Publicar/Despublicar* y *Eliminar*.
- **Panel del miembro > Novedades**: tarjetas con la noticia, boton *Leer completo*
  (lector en ventana) y *Ver video* (reproductor). Al costado, la lista de videos
  institucionales y un acceso a contacto.

Como funciona:

- Tabla `NewsPost` (titulo, resumen, contenido, categoria, imagenUrl, videoUrl,
  autor, destacado, publicado, fechaPublicacion). Se aplica con `npx prisma db push`
  (usar el pooler de sesion 5432).
- Endpoint `/api/noticias`:
  - `GET`: el miembro solo recibe las **publicadas**; el equipo con licencia
    validada tambien ve los **borradores**.
  - `POST` / `PATCH` / `DELETE`: requieren sesion del equipo **y** licencia
    administrativa validada (403 en caso contrario).
- La imagen y el video se indican por URL: se pueden usar los archivos ya servidos
  del sitio (`/videocarru2nuevo.mp4`, `/sistemasan.mp4`, …) o cualquier URL externa.
- `public/` no contiene videos pesados: ver la nota de rendimiento en la seccion 1.7.

  y las del administrador **nunca se separan**. Tiene pruebas en
  `tests/installment-schedule.test.mjs`.
- Los archivos se sirven por `/api/member-files/file`, que solo entrega documentos
  del expediente cuyo `userId` coincide con el del miembro.
- Si la carga falla, el panel avisa y ofrece **Reintentar** (nunca muestra una
  pantalla vacia sin explicacion).


- **Panel admin > "Financiados"**: lista solo a las personas cuyo plan es de
  financiamiento, con su cuota quincenal, cuotas pagadas/total, saldo, estado y
  proximo vencimiento. Los indicadores de arriba muestran cuantos son, el saldo
  total por cobrar, las cuotas pendientes y cuantos estan con atraso.
- El boton **"Abrir expediente"** de cada fila lleva al monitor de cuotas con esa
  persona seleccionada y la pestaña **Expediente** abierta (documentos,
  credenciales y detalle de cuotas).

## 2) Provisionar base de datos Postgres

1. Crear instancia Postgres administrada.
2. Crear base de datos dedicada para la app.
3. Crear usuario con permisos limitados sobre esa base.
4. Cargar `DATABASE_URL` en el entorno de despliegue.

## 3) Inicializar Prisma en produccion

Ejecutar en el entorno del release:

```bash
npm run db:generate
npm run db:migrate:deploy
```

Para desarrollo local:

```bash
npm run db:migrate:dev
```

## 4) Build y arranque

```bash
npm ci
npm run build
npm run start
```

### Despliegue a Cloudflare

```bash
npm run deploy:cf
```

> Importante: `deploy:cf` ya **compila y despliega** en un solo paso. Si se
> despliega sin compilar, Cloudflare sube el `.open-next` anterior y los cambios
> no llegan a produccion.

## 5) Test minimo antes de desplegar

```bash
npm run test
npm run build
```

## 6) Checklist de salida a produccion

- `npm run test` pasa.
- `npm run build` pasa.
- Variables de entorno cargadas en entorno productivo.
- Migraciones aplicadas con `db:migrate:deploy`.
- Login admin validado con licencia encriptada.
- Endpoints sensibles responden `401/403` sin sesion/rol.
- `npx wrangler secret list` muestra `AUTH_SECRET` (y, si ya se separo,
  `MEMBER_KEY_ENCRYPTION_SECRET`). **Nunca** en `wrangler.jsonc` `vars`.
- Segundo factor probado en una cuenta de prueba: alta, codigo de recuperacion y
  baja (seccion 7.6 de `SEGURIDAD_INTEGRAL.md`).
- Tras desplegar, un login real: los tokens anteriores se invalidan a proposito
  (no llevan `tokenVersion`), asi que todo el mundo vuelve a entrar una vez.

## 7) Monitoreo operativo recomendado

- Errores 5xx por ruta API.
- Tiempo de respuesta en `/api/auth/login` y `/api/member-files/scan`.
- Memoria y CPU del proceso Node (OCR puede elevar CPU).
- Estado de conexiones a Postgres.
- Panel de auditoria (`/admin` -> Auditoria): descargas masivas (>20/h), fallos de
  acceso (>10/h), accesos fuera de horario y **solicitudes de correccion de datos**
  de los ultimos 7 dias (derecho de rectificacion).

## 8) Backups y recuperacion

Base de datos:
- Snapshot diario de base de datos.
- Retencion minima recomendada: 14 dias.
- Verificar restauracion mensualmente en entorno de staging.

Documentos (expedientes):
- `node scripts/backup-documents.mjs` (documentos + manifiesto con las filas).
- `node scripts/check-storage-integrity.mjs` para detectar faltantes.
- `node scripts/purge-trash.mjs --apply` para vaciar la papelera (30 dias).
- Guardar el respaldo fuera del equipo (nube o disco externo).

### 8.1 Cifrado de los respaldos (obligatorio antes de sacarlos del equipo)

Define `BACKUP_PASSPHRASE` (minimo 16 caracteres) antes de respaldar. Con ella, los
dos scripts escriben `.enc` cifrados con AES-256-GCM y clave derivada por
PBKDF2-SHA256 (250.000 iteraciones):

```
BACKUP_PASSPHRASE='...' node scripts/backup-users.mjs
BACKUP_PASSPHRASE='...' node scripts/backup-documents.mjs
```

Sin la variable, el respaldo se escribe **en claro** y el script lo avisa por
consola. Un respaldo en claro contiene los hashes de contrasena de todas las cuentas
y los documentos de los expedientes.

**Guardar la contrasena en un gestor de contrasenas.** No hay puerta trasera: sin
ella el respaldo es ilegible para siempre.

### 8.2 Prueba de restauracion (mensual)

```
node scripts/restore-backup.mjs --verificar backups/users-<fecha>.json.enc
node scripts/restore-backup.mjs --carpeta backups/documents/<fecha>
```

- `--verificar` descifra **en memoria** y no escribe nada: confirma que la
  contrasena abre el archivo y muestra su `sha256`.
- `--carpeta` descifra todos los `.enc` y comprueba cada documento contra el
  `sha256` del manifiesto. Cualquier archivo alterado se marca como `ALTERADO` y
  cualquier ilegible como `FALLO`.

Anotar la fecha de la ultima prueba: un respaldo que no se ha probado a restaurar
no es un respaldo.

## 9) Mantenimiento programado

| Tarea | Cuando | Comando |
|---|---|---|
| Respaldo de la base de datos | Semanal | `node scripts/backup-users.mjs` |
| Respaldo de documentos | Semanal | `node scripts/backup-documents.mjs` |
| **Prueba de restauracion** | Mensual | `node scripts/restore-backup.mjs --verificar <archivo>` |
| Revisar informes de CSP | Antes de activar la CSP estricta | `node scripts/csp-report-summary.mjs --dias 30` |
| Purgar la auditoria por retencion | Mensual | `node scripts/purge-audit-log.mjs --apply` |
| Vaciar la papelera | Semanal | `node scripts/purge-trash.mjs --apply` |
| Verificar integridad del almacenamiento | Mensual | `node scripts/check-storage-integrity.mjs` |

Todos los scripts de escritura son **simulacro por defecto**: sin `--apply` no
cambian nada. Leer siempre la salida del simulacro antes de aplicarlo.

### 9.1 Purgar la auditoria

`node scripts/purge-audit-log.mjs` (simulacro) y `--apply` para aplicarlo.

- Dos ventanas: `AUDIT_RETENTION_DAYS` (general, 730 dias por defecto) y
  `AUDIT_RETENTION_DAYS_AUTH` (sesion, 365).
- Deja un resumen permanente en la auditoria (`AUDIT_PURGE`), que nunca se borra.
- Si el resumen no aparece, la purga no llego a completarse.

### 9.2 Separar y rotar el secreto de credenciales

Mientras `MEMBER_KEY_ENCRYPTION_SECRET` no exista, el cifrado de las claves de
miembro sigue usando `AUTH_SECRET`. Para separarlos:

1. `node scripts/backup-users.mjs`
2. `npx wrangler secret put MEMBER_KEY_ENCRYPTION_SECRET` (valor nuevo, distinto de
   `AUTH_SECRET`; 32+ caracteres aleatorios)
3. `node scripts/rotate-member-key-secret.mjs` (simulacro: dice cuantas filas
   recifraria y si alguna es ilegible)
4. `node scripts/rotate-member-key-secret.mjs --apply`
5. Lectura de prueba en el panel (Monitor de cuotas -> credenciales) y
   `node scripts/check-storage-integrity.mjs`

Es idempotente: se puede repetir. Las filas que no abren con ningun secreto no se
sobrescriben, se listan para revisarlas a mano.

### 9.3 Restablecer el segundo factor de una cuenta

Si alguien pierde el dispositivo **y** los codigos de recuperacion:

```
node scripts/reset-user-totp.mjs --email <correo>          (simulacro)
node scripts/reset-user-totp.mjs --email <correo> --apply
```

Queda registrado en la auditoria (`TOTP_DISABLED` con `metadata.via = script_cli`).
Pedir a la persona que lo vuelva a activar de inmediato.

### 9.4 Solicitudes de correccion de datos

Los miembros pueden pedir la correccion de un dato desde su panel (pestana
Seguridad). El equipo las ve en `/admin` -> Auditoria, como alerta
**"correcciones pendientes"** (solicitudes de los ultimos 7 dias).

Flujo:

1. Revisar la alerta y filtrar la tabla por la accion `CORRECCION_SOLICITADA`.
2. Cada fila lleva el campo pedido y el detalle del titular, ademas de la cedula
   enmascarada.
3. Corregir el dato en el expediente (queda auditado como `EXPEDIENTE_UPDATE`).
4. Avisar al miembro de que ya esta corregido.

No hay estado "resuelta" por solicitud: el cierre se deduce del `EXPEDIENTE_UPDATE`
posterior. La solicitud original **no se borra nunca** salvo por la purga de
retencion.

### 9.5 Informes de CSP

La politica estricta (sin `unsafe-inline`) viaja en modo informe y los navegadores
mandan lo que habrian bloqueado a `/api/csp-report`. Para decidir si ya se puede
activar:

```
node scripts/csp-report-summary.mjs --dias 30
```

Agrega por directiva, recurso bloqueado y pagina, y da un veredicto. Si aparece
`inline` en `script-src` o `style-src`, **no** se activa todavia.

Los informes se limpian con la ventana corta de `purge-audit-log.mjs` (son
telemetria de alta rotacion, no auditoria).

### 9.6 La carpeta `.open-next/` es sensible

El build de OpenNext escribe `.open-next/cloudflare/next-env.mjs` con **las
variables de entorno del build en claro** (incluida la contrasena de la base, la
`service_role` key y `AUTH_SECRET`).

- No esta versionada (`.gitignore`) y **no se empaqueta** en el Worker desplegado:
  se comprobo que ni `worker.js` ni el handler la importan.
- Aun asi, mientras exista en el equipo contiene secretos: no compartir ni
  comprimir la carpeta del proyecto sin borrarla antes, y tratarla como un
  `.env.local`.
- Si el equipo se pierde o se comparte, hay que **rotar** `AUTH_SECRET`,
  `SUPABASE_SERVICE_ROLE_KEY` y la contrasena de la base.

### 9.7 Rotacion periodica de secretos y de la licencia

Calendario recomendado: **cada 6 meses** y **siempre** tras una salida de personal,
una sospecha de filtracion o la perdida de un equipo.

| Secreto | Como se rota | Efecto |
|---|---|---|
| `AUTH_SECRET` | `npx wrangler secret put AUTH_SECRET` | **Se invalidan TODAS las sesiones**: todo el mundo vuelve a entrar. Hacerlo en horario de baja actividad |
| `ADMIN_LICENSE_HASH` | `node scripts/set-admin-license.mjs` y publicar el hash | La licencia anterior deja de servir; el step-up caduca en 4 h |
| `MEMBER_KEY_ENCRYPTION_SECRET` | Seccion 9.2 | Ninguno: la app abre lo antiguo con el secreto heredado hasta que se recifra |
| `SUPABASE_SERVICE_ROLE_KEY` | Rotar en el panel de Supabase y `wrangler secret put` | Reinicia el Worker; los documentos siguen accesibles |
| `BACKUP_PASSPHRASE` | Elegir una nueva | **Guardar la anterior**: los respaldos viejos se descifran con la de su fecha |
| Contrasena de la base | Rotar en Supabase y actualizar `DATABASE_URL`/Hyperdrive | Reinicia el Worker |

Comprobar despues de cada rotacion: un login real, una descarga de documento y
`node scripts/check-storage-integrity.mjs`.

### 9.8 Cloudflare: WAF y Access delante de `/admin` (pendiente de configurar)

Esta es la unica capa que no se puede versionar en el repositorio: se configura en
el panel de Cloudflare. Mientras no este puesta, `/admin` depende solo de la app
(rol + licencia + 2FA), que ya esta endurecida.

**WAF (gratuito en el plan Free):**

1. Panel de Cloudflare -> *Security* -> *WAF* -> *Custom rules*.
2. Regla 1: si `http.request.uri.path starts_with "/admin"` **y**
   `cf.threat_score gt 14` -> *Block*.
3. Regla 2: si `http.request.uri.path starts_with "/api/auth"` **y**
   `http.request.method eq "POST"` **y** `cf.threat_score gt 25` -> *Managed
   challenge*.
4. Activar *Bot Fight Mode* si el plan lo permite.

**Cloudflare Access (Zero Trust):**

1. *Zero Trust* -> *Access* -> *Applications* -> *Add an application* -> *Self-hosted*.
2. Aplicacion sobre `sanmerida.com/admin` (y `/admin/*`).
3. Politica: *Allow* solo para los correos del equipo administrativo.
4. Metodo de identidad: One-time PIN por correo (no exige IdP externo) o Google.
5. Session duration: 8 horas.
6. **Probar primero en una ruta de prueba**: si la politica queda mal, deja a todo
   el equipo fuera del panel.

Cuando este activo, anotarlo aqui con la fecha.

### 9.9 Validacion TLS en los scripts

Los scripts que hablan con Postgres usan `src/lib/db-ssl.mjs`. **Nunca escribas
`rejectUnauthorized: false` a mano**: `tests/db-ssl.test.mjs` tiene un guardian que falla
si vuelve a aparecer en `scripts/`.

**Por que no basta con `rejectUnauthorized: true`.** El pooler de Supabase presenta un
certificado autofirmado en la cadena, asi que `pg` no puede validarlo contra la lista de CAs
de Node:

```
Error: self-signed certificate in certificate chain
  code: 'SELF_SIGNED_CERT_IN_CHAIN'
```

Es del endpoint, no de tu red (GitHub, npm y supabase.com validan bien desde el mismo
equipo). La documentacion de Supabase lo dice: `sslmode=require` cifra pero **no verifica**;
para verificar hay que darle la CA del proyecto.

**Arreglo correcto (una sola vez):**

1. Supabase → *Database settings* → *SSL configuration* → descargar el certificado.
2. Guardarlo **fuera del repositorio** (por ejemplo `D:\certs\supabase-raiz.crt`).
3. Definirlo en el entorno antes de ejecutar los scripts:

```powershell
$env:DATABASE_CA_CERT = "D:\certs\supabase-raiz.crt"
node scripts/backup-documents.mjs
```

Alternativa equivalente, a nivel de Node: `$env:NODE_EXTRA_CA_CERTS = "D:\certs\..."`.

**Si no se puede conseguir la CA**, queda la salida de emergencia, que es un acto
deliberado y **avisa en pantalla cada vez que se usa**:

```powershell
$env:DATABASE_SSL_NO_VERIFY = "1"
node scripts/backup-documents.mjs
```

Cifra sin verificar. Es lo mismo que hace `sslmode=require`, y es peor que validar, pero es
**mucho mejor que dejar de hacer respaldos** o que borrar la comprobacion del codigo.

### 9.10 Variables de entorno de los scripts

| Variable | Para que |
|---|---|
| `DATABASE_CA_CERT` | Ruta al certificado raiz del proyecto (recomendado, seccion 9.9) |
| `NODE_EXTRA_CA_CERTS` | Lo mismo, resuelto por Node |
| `DATABASE_SSL_NO_VERIFY` | `1` = cifra sin verificar (salida de emergencia, avisa) |
| `BACKUP_PASSPHRASE` | Contrasena del respaldo cifrado (>= 16 caracteres, seccion 8.1) |
| `MEMBER_KEY_ENCRYPTION_SECRET` | Secreto de las credenciales de miembros (seccion 9.2) |
| `LOCAL_DATABASE_URL` | Postgres local, solo para los scripts de migracion |

## 10) Procedimiento de incidentes de seguridad

> Cierra el paso **2.6** de `docs/SEGURIDAD_INTEGRAL.md`. El objetivo no es tener un
> documento: es que **la primera hora no se improvise**. Quien detecta algo abre aqui y
> sigue los pasos en orden.

### 10.1 Que cuenta como incidente

No hay que decidir si "es grave": se activa el procedimiento y se decide despues.

| Situacion | Por que es incidente |
|---|---|
| Un expediente leido o descargado por quien no debia | Fuga de datos personales |
| Documentos o filas que aparecen borrados o alterados | Integridad comprometida |
| Alerta del panel de auditoria (descargas masivas, intentos fallidos, acceso fuera de horario) | Posible acceso no autorizado |
| `LOGIN_FAILED` en rafaga contra una cuenta o desde una IP | Fuerza bruta |
| Una cuenta con 2FA desactivado sin que su titular lo hiciera | La cuenta esta comprometida |
| El respaldo cifrado no se puede abrir, o falta | Perdida de datos |
| Una credencial pudo filtrarse (`AUTH_SECRET`, licencia, contrasena, `SUPABASE_SERVICE_ROLE_KEY`) | Hay que rotar |
| El sitio muestra contenido que nadie publico | Defacement |

### 10.2 Los primeros 60 minutos

**Regla de oro: primero se corta, despues se investiga.** Investigar con el atacante dentro
le da tiempo a borrar sus huellas.

1. **Anotar la hora exacta** del primer indicio. Todo lo demas se cronometra desde ahi.
2. **No borrar nada.** Ni logs, ni archivos, ni la fila de auditoria. Si hay que sacar algo
   de circulacion, se **mueve**, no se elimina.
3. **Contener sin destruir la evidencia**, en este orden y parando cuando el incidente quede
   cortado:
   - **Cortar la cuenta afectada**: incrementar `tokenVersion` invalida sus sesiones al
     instante. Desde el panel, o con `node scripts/reset-member-password.mjs`.
   - **Cortar la licencia administrativa** si el incidente es del lado del equipo:
     `node scripts/set-admin-license.mjs "<nueva>"` + publicar el hash + desplegar.
   - **Revertir el despliegue** si hay defacement o ejecucion de codigo: en el panel de
     Cloudflare, *Workers* → *Deployments* → *Rollback* a la version anterior. Tarda
     segundos y es reversible.
   - **Poner Cloudflare Access delante de `/admin`** (seccion 9.8) si aun no esta: deja el
     panel cerrado a todo el mundo menos a los correos del equipo.
4. **Avisar a una segunda persona.** Un incidente llevado por una sola persona pierde
   detalles, y ademas nadie deberia ser juez de su propio error.

### 10.3 Evaluacion del alcance

La tabla `AuditLog` es la herramienta principal. No se puede consultar sin `auditoria:read`
(rol ADMIN + licencia) y **no se puede editar ni borrar desde la aplicacion**.

| Pregunta | Donde se responde |
|---|---|
| ¿Que cuentas entraron? | `LOGIN_SUCCESS` / `LOGIN_FAILED` en `/api/auditoria` |
| ¿Que expedientes se leyeron? | `EXPEDIENTE_READ` / `DOCUMENTO_READ` / `DOCUMENTO_DOWNLOAD` |
| ¿Que se modifico? | `EXPEDIENTE_UPDATE`, `PASSWORD_CHANGED`, `TOTP_*`, `CORRECCION_*` |
| ¿Se descargo mucho de golpe? | Conteo de `DOCUMENTO_DOWNLOAD` por actor y hora |
| ¿Desde donde? | `ip` y `userAgent` de cada fila (`src/lib/request-info.mjs`) |
| ¿Se purgo algo a mano? | `AUDIT_PURGE` |

Pasos:

1. Acotar la **ventana**: desde el primer indicio hasta la contencion.
2. Listar **actores** implicados y **expedientes** tocados. Eso define a quien hay que avisar.
3. Comprobar **integridad**: `node scripts/check-storage-integrity.mjs` (documentos faltantes,
   tamanos distintos) y comparar contra el ultimo respaldo.
4. Decidir si hay **datos personales comprometidos**. Si los hay, la notificacion de 10.5 no
   es opcional.

> Limite conocido y asumido: la auditoria guarda **el hecho y los metadatos, no el
> contenido**. Si alguien leyo un expediente, se sabe; no se sabe "que se llevo".

### 10.4 Erradicacion y recuperacion

1. **Cerrar la puerta** por la que entro: rotar la credencial concreta (seccion 9.7), corregir
   el fallo o desplegar la version corregida.
2. **Rotar todo lo que estuvo al alcance**, aunque no haya prueba de uso:
   - Contrasena del titular afectado (panel, o `scripts/reset-member-password.mjs`).
   - Segundo factor: `node scripts/reset-user-totp.mjs` (borra secreto y codigos de
     recuperacion; la persona lo vuelve a configurar).
   - Si el incidente toca el servidor: `AUTH_SECRET` y `MEMBER_KEY_ENCRYPTION_SECRET`
     (seccion 9.2). Rotar `MEMBER_KEY_ENCRYPTION_SECRET` deja las credenciales de miembros
     pendientes de regenerar; rotar `AUTH_SECRET` invalida **todas** las sesiones.
   - Licencia administrativa si el equipo esta implicado.
3. **Restaurar** solo si hay datos perdidos, y desde un respaldo **verificado**:
   `node scripts/restore-backup.mjs --verificar <archivo>` primero (no escribe nada).
4. **Vigilar 7 dias.** Repasar `/api/auditoria` a diario: un atacante contenido suele volver
   por otra via.

### 10.5 Notificacion

| A quien | Cuando | Plazo |
|---|---|---|
| Responsable del sistema | En cuanto se confirma | Inmediato |
| Personas afectadas | Si sus datos personales quedaron expuestos | **Sin demora injustificada**; en la practica, antes de 72 h |
| Autoridad de proteccion de datos | Si la brecha es de riesgo para los derechos de las personas | **72 h** desde que se tiene constancia |

Una brecha "de riesgo" no exige que alguien haya usado los datos: basta con que puedan
usarse. Ante la duda, se notifica.

**Que se comunica** (nada mas): que paso, cuando, que datos, que se ha hecho ya, que debe
hacer la persona afectada (cambiar la contrasena, revisar sus movimientos) y a quien
preguntar. **Sin** detalles tecnicos que den pistas y **sin** culpar a la persona afectada.

Si el incidente implica delito (extorsion, robo de datos, suplantacion), se presenta la
denuncia: este procedimiento no la sustituye.

### 10.6 Playbooks por tipo

| Tipo | Contencion inmediata | Erradicacion |
|---|---|---|
| **Credencial filtrada** | Bloquear la cuenta y avisar al titular | Contrasena nueva + 2FA + `tokenVersion++` |
| **Sesion robada** (cookie) | `tokenVersion++` corta todas las sesiones de esa cuenta | Cambiar contrasena; revisar `PASSWORD_CHANGED` |
| **2FA desactivado por un tercero** | Cortar el acceso y resetear el TOTP | Contrasena nueva + TOTP nuevo; revisar que leyo |
| **Acceso indebido al panel** | Cloudflare Access (9.8) + rotar la licencia | Corregir el fallo; revisar los `EXPEDIENTE_*` de la ventana |
| **Fuga de documentos** | Identificar las claves afectadas y cortar el acceso | Notificar (10.5); revisar el bucket y la papelera |
| **Ransomware / equipo comprometido** | Aislar el equipo de la red; **no** pagar | Restaurar desde respaldo verificado; rotar **todos** los secretos |
| **Perdida de datos** | Parar las escrituras; medir el alcance | `restore-backup.mjs --carpeta` (verifica sha256 contra el manifiesto) |
| **Caida del proveedor** | Nada que contener; comunicar | Esperar; el respaldo es local |

### 10.7 Cierre: informe y aprendizaje

En un plazo de 7 dias desde el cierre, dejar por escrito (y anotarlo aqui):

1. Cronologia: deteccion, contencion, erradicacion, recuperacion (con horas).
2. **Causa raiz**, en una frase. Si la respuesta es "un despiste", hay que buscar el control
   que falto, no la persona.
3. Alcance real: cuentas, expedientes, datos.
4. Que se hizo y que quedo pendiente.
5. **Que control se anade** para que no vuelva a pasar. Si la respuesta es "mas cuidado", no
   es una respuesta: hace falta un test, un limite, un permiso o un aviso.

Ese ultimo punto es el unico que evita repetir el incidente: los cinco anteriores explican lo
que paso, el sexto lo previene.



