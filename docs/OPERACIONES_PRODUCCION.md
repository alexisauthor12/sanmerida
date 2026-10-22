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
- `DATABASE_URL` debe apuntar a Postgres productivo con TLS según proveedor.
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

> Nota de rendimiento: tener los videos pesados en `public/` hace que cada build
> copie ~750 MB. Si se necesita un build rapido, moverlos a `storage-videos/`
> (fuera de `public/`): el resultado del despliegue es el mismo.

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

## 7) Monitoreo operativo recomendado

- Errores 5xx por ruta API.
- Tiempo de respuesta en `/api/auth/login` y `/api/member-files/scan`.
- Memoria y CPU del proceso Node (OCR puede elevar CPU).
- Estado de conexiones a Postgres.

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
