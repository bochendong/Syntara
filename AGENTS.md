# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Syntara is a Next.js 16 monorepo (pnpm workspace) with two internal packages (`packages/mathml2omml`, `packages/pptxgenjs`). It runs in **local-first mode** (browser IndexedDB) by default — PostgreSQL is only needed for multi-user/auth features.

### Prerequisites

- **Node.js 22** (per `.nvmrc`)
- **pnpm 10.28.0** (declared in `packageManager` field; activate via `corepack enable && corepack prepare pnpm@10.28.0 --activate`)

### Running the dev server

```bash
pnpm dev          # starts Next.js on http://localhost:3000
```

The app requires at least one LLM provider API key in `.env.local` (e.g. `OPENAI_API_KEY`). Without it the generation feature won't work. Default model is `gpt-4o-mini` unless `DEFAULT_MODEL` is set.

### Environment file

Copy `.env.example` to `.env.local`. At minimum, set one LLM provider key. PostgreSQL (`DATABASE_URL`) is optional — without it, the `/api/courses` endpoint returns 500 but the app's local-first mode still works via `/create?courseId=openmaic-legacy-course`.

### Prisma client

After `pnpm install`, run `npx prisma generate` to generate the Prisma client. This is needed even without a database, as some server-side imports reference `@prisma/client`.

### CI checks (see `CONTRIBUTING.md`)

```bash
pnpm lint              # ESLint
pnpm check             # Prettier format check
npx tsc --noEmit       # TypeScript type check
```

The codebase has pre-existing lint/format warnings; these are not caused by agent changes.

### Key gotchas

- The `postinstall` script builds both workspace packages. If it fails, manually run: `cd packages/mathml2omml && npm run build && cd ../pptxgenjs && npm run build`.
- `pnpm install` shows warnings about ignored build scripts (prisma, sharp, etc.) — these are expected due to `pnpm.ignoredBuiltDependencies` in `package.json`.
- There are no automated test suites in this project (no test framework in devDependencies). Verification is done via lint, type check, and manual testing.
- The login page uses a local demo mode when OAuth providers aren't configured — enter any name/email to proceed.
- To bypass the database-dependent course creation flow, navigate directly to `/create?courseId=openmaic-legacy-course`.
