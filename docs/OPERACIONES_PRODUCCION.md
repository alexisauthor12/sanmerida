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

- Snapshot diario de base de datos.
- Retencion minima recomendada: 14 dias.
- Verificar restauracion mensualmente en entorno de staging.
