This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

## Security environment variables (required)

For production hardening, define these variables in your deployment environment:

- `AUTH_SECRET`: secret used to sign and verify session/admin JWTs.
- `ADMIN_USERNAME`: admin username accepted by `/api/auth/admin-license`.
- `ADMIN_LICENSE_HASH`: bcrypt hash for admin license validation.

Notes:

- `ADMIN_LICENSE_HASH` must be a valid bcrypt hash (`$2a$...`, `$2b$...`, or `$2y$...`).
- Do not hardcode admin credentials in source code.
- Rotate `ADMIN_LICENSE_HASH` periodically and after any security incident.

## Database (PostgreSQL)

This project is configured for PostgreSQL in Prisma.

Development migration:

```bash
npm run db:migrate:dev
```

Production migration:

```bash
npm run db:migrate:deploy
```

## Tests

Run minimal hardening tests:

```bash
npm run test
```

## Operational runbook

Production setup and operations checklist:

- `docs/OPERACIONES_PRODUCCION.md`

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
