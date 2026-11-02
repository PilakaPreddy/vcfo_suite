# CLAUDE.md — working instructions for Claude Code

## What this is

VCFO Suite is a compliance cockpit for an Indian professional-services firm (SBC). It runs
company incorporation end to end (client questionnaire, the 34-step SPICe+ checklist,
generated MCA documents, board resolutions) and then the recurring compliance calendar.
Five roles share one app: `super_admin`, `admin`, `manager`, `intern` (project lead) and
`client`. Clients get their own portal shell; staff share the "noir" shell.

It is **not** a scaffold any more. Everything in `docs/context/STATE.md` marked done is built,
typechecked and deployed to AWS App Runner (`app.sbctrack.in`). Read `docs/context/STATE.md`
and `docs/STATUS.md` at the start of every session, and update `STATE.md` when you finish work.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (non-strict) · Postgres via Drizzle ·
Auth.js v5 · S3 (MinIO locally) · Inngest jobs · Resend or SES email · AWS End User Messaging
for WhatsApp · Tailwind 3 with shadcn-style components · Vitest + Testing Library · Playwright.
Terraform in `infra/` deploys App Runner + RDS + S3 + Secrets Manager + SES.

## How to run

```bash
cp .env.example .env.local      # set AUTH_SECRET with: openssl rand -base64 32
npm install
npm run infra:up                # Docker Postgres (user vcfo) + MinIO; idempotent
npm run db:migrate              # apply src/db/migrations (db:generate after schema edits)
npm run db:seed                 # @vcfo.local logins; npm run db:seed-demo adds demo firms
npm run dev                     # http://localhost:3000 (dev:lan binds 0.0.0.0 for phones)
npm run check                   # the gate: typecheck, lint, test (fails fast)
npm run e2e:smoke               # every page, every role (needs db:seed-demo); npm run e2e = all specs
```

Demo logins are listed in `README.md` and `docs/context/STATE.md`. Gotchas for Docker, LAN
access, tunnels and Auth.js URLs are in `docs/context/notes/tooling.md`.

## Folder map

- `app/` — Next.js routes only. `app/app/{super,admin,manager,intern,client}` are thin shells
  that render a view; `app/api/*` are the ~35 route handlers; `app/globals.css` holds tokens.
- `src/views/` — the real page components, one folder per area and role.
- `src/components/` — shared UI. `shell/` (staff sidebar, top bar), `dash/` (DashHero,
  DashSection), `ui/` (shadcn primitives), `client-portal/` (the client shell and pages),
  `intern/`, `charts/`, `incorporation/`, `compliances/`, `ask/`.
- `src/lib/` — domain logic, one folder per area (one line each in `src/lib/README.md`):
  `checklist/` (34-step validation and gating), `board-resolution/` and `incorporation-docs/`
  (docx), `incorporation/`, `projects/`, `compliance/`, `doc-pack/`, `ask/`, `email/`, `notify/`.
  Generic helpers (`utils.ts`, `auth.ts`, `slug.ts`) sit at the top; tests sit beside the code.
- `src/data/` — pure data: `checklist.ts` (the 34 steps), obligations, NIC codes, Ask topics.
- `src/db/` — the seam: Drizzle client, `schema*.ts`, `migrations/`, `repositories/`. Large
  repositories are folders (`engagements/`, `credentials/`) whose `index.ts` keeps the import path.
- `src/auth/` — Auth.js config and role guards. `src/storage/` — S3 helpers.
  `src/jobs/` — Inngest functions. `src/context/` — client state (`app-provider/` holds the
  provider's concerns). `src/hooks/` — shared React Query and UI hooks (`use-*.ts`; Ask
  hooks in `hooks/ask/`).
- `scripts/` — seeds, docx template builders, `cp-css.mjs`, `design-tokens-*.mjs`.
- `docs/` — `context/` (live memory), `specs/` (feature specs and the client portal
  prototype), `design/` (the design system), `STATUS.md` (branch status and refactor list).
- `e2e/`, `tests/ask/` — Playwright specs and Ask VCFO evals. `infra/` — Terraform.
  `public/templates/` — .docx templates. `certs/` — public RDS CA bundle (not a secret).

## Golden rules (unchanged from the original build)

1. **The seam is sacred.** Only `src/db/repositories/*` may import `db`. Views, domain logic
   and routes call repositories. Never import `db` or `s3` in a component.
2. **Every repository takes an `AuthContext` and scopes by role.** The rules are in
   `src/db/repositories/README.md` and `docs/context/notes/data-access.md`; access control
   lives there, not in Postgres RLS.
3. **Do not rewrite the ported domain code** (`src/lib/checklist/`, the docx generators,
   `src/lib/compliance/`, `src/data/checklist.ts`) unless a test fails or a spec asks for it.
4. **Dev/prod parity.** Local uses Docker Postgres + MinIO; AWS uses RDS + S3. Everything
   flows through env vars; never hardcode an endpoint.
5. **Verify each phase** with `npm run typecheck && npm run test` before moving on.
6. **Outbound messaging is additive.** Email (`EMAIL_PROVIDER=resend|ses`,
   `src/lib/email/send-email.ts`) is the system of record. WhatsApp
   (`src/lib/notify/send-whatsapp.ts`) is an outbound-only nudge; a WhatsApp failure must never
   slow or block the email path. Setup and templates: `docs/context/notes/aws.md`.
7. Do not reintroduce Supabase. Do not add Kubernetes, microservices or Lambda-everything.
   Do not put secrets in the client bundle or commit `.env.local`. Do not bypass the seam
   "for just one query".
8. Write docs and comments in plain full sentences. Do not commit unless the owner asks.

## Conventions

- **Design tokens.** `docs/design/design-tokens.json` is the source of truth.
  `node scripts/design-tokens-css.mjs --write` regenerates the block between the
  `@design-tokens` markers in `app/globals.css`; `node scripts/design-tokens-check.mjs` is the
  contrast gate. Token names are semantic (`surface`, `line`, `ink`, `brand`, `highlight`,
  `positive`/`warning`/`danger`/`info`, `side*`, `data-1..6`). Old names (`--primary`,
  `--gold`, `--accent-*`, `--phase-*`, `--role-*`) are aliases until 2026-11-30. Rules and the
  canonical-component table: `docs/context/notes/design-system.md`, `docs/design/COMPONENTS.md`.
- **Client portal CSS.** Edit `src/components/client-portal/css-src/*.css`, then run
  `node scripts/cp-css.mjs` to regenerate `css/` (scoped under `.cp`). Never edit `css/`.
  `portal-css.ts` lists the cascade order.
- **Component homes.** One greeting card (`DashHero`), one section card (`DashSection`), one
  chip style (`IconChip`), one button set (`ui/button-variants.ts`). Never fork a primitive.
- **Large views.** A big page keeps its JSX in the original file; state moves to a `use*` hook
  and closure render helpers to `create*`/`render*` factories in a sibling folder (for example
  `src/views/incorporation/milestone-form/`), so the rendered tree does not change.
- **Fonts and imports.** Public Sans for UI, IBM Plex Mono for identifiers (`app/layout.tsx`).
  `@/` maps to `src/`; `scripts/` and `e2e/` sit outside the `tsconfig` include list.

## Where the context lives

- `docs/context/STATE.md` — what is verified and deployed, what is deferred.
- `docs/context/HOW-TO-BUILD.md` — recipes (page, route, repository, migration, job, UI) and a "Where is X?" table.
- `docs/context/notes/*.md` — gotchas per area (aws, checklist-workflow, compliance,
  data-access, demo-data, design-system, email, incorporation-docs, lead-ui, notifications,
  shell-ui, tooling). Append when something costs more than a minute.
- `docs/context/AWS-DEPLOY.md` and `infra/README.md` — the deploy runbook.
- `docs/specs/` — specs still in progress; finished specs are in git history. `QUESTIONS.md`
  at the root lists the client portal v7 decisions the owner may still want to change.

## Current branch: `ui/spectrum`

The branch ports the VCFO Spectrum design from the prototype's `design/spectrum` branch onto
every portal, on top of `port/carryover-1` (which holds the design-system work and the K-01 to
K-47 carry-over). On 2026-10-29 it was fast-forwarded to `main` (72d2d7f) and deployed; RDS is on
migration 0026. Read `docs/ui-port/REPORT.md` first; the
audit, decisions, gaps and the screen-agent brief sit beside it. Spectrum rules (R-01 to R-48)
are in the prototype's `docs/RULES.md`; the shared Spectrum parts are
`src/components/ui/{spectrum-chip,step-track,spectrum-tabs,file-badge,empty-state}.tsx`, and
`DashHero` is the home card on the colour wash. Untracked files the owner left in the tree
(`docs/overview/*`, `docs/specs/landing-page/lovable/`, `scripts/build-incorp-docs-er*.mjs`,
`new_context.md`, and edits to `docker-compose.yml`, `package.json` and the landing README)
are not part of the port and were not committed. A second pass the same day built every gap in
`docs/ui-port/GAPS.md` and the prototype's parity pass; it adds migration `0026_gaps_backend`
(apply on RDS before deploy) and a `developer` role that only `requireDeveloper` admits.

## Next steps / known issues

- `src/lib/email/email-layout.ts` still has its own literal palette (not Spectrum yet).
- `npm run lint` has 0 errors and 329 warnings (mostly `react-refresh/only-export-components`).
- `CREDENTIALS_ENCRYPTION_KEY` is not set on App Runner yet, so portal credential features
  throw in production until it is added.
- Role checks in repositories must use the helpers in `src/lib/auth.ts` (`isFirmWideAdmin`,
  `isAdminOrManager`); hand-written `role === 'admin'` checks dropped `super_admin` in seven
  places until 2026-10-22. Portal repositories (`client-*`, `knowledge-bank`, `profiles`) still
  lack cross-tenant tests.
- Seeded demo passwords still exist on RDS; change or purge them before real users.
- `docs/STATUS.md` holds the prioritised list of deeper refactors not yet done.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
