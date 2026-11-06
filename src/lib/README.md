# src/lib

Domain logic and helpers. Nothing here imports `db`; data access goes through
`src/db/repositories/*`. Tests sit next to the code as `*.test.ts`. React hooks live in
`src/hooks/`, not here.

## Folders

- `api/` — helpers shared by `app/api/**` route handlers (body parsing, schemas, generate and access checks).
- `ask/` — Ask VCFO: retrieval, prompts, guards, PDF briefs and the tool calls it can make. `ask/data-router/` turns a file or a paste into proposed fields, `ask/changeset/` is the review card's approval and undo, and `ask/field-catalog/` is the generated list of fields.
- `assist-profile/` — builds the company profile that the vcfo_assist browser extension fills into MCA portals.
- `audit/` — audit-log display formatting and the role rules for who sees which audit events.
- `budget/` — annual cost budgets: the one calculation (`engine.ts`), Excel and PDF, the owner's workbook import, and messages.
- `board-resolution/` — board resolution data model, docx generation, preview and storage keys.
- `board-meetings/` — board meetings after incorporation: dates (T-10, T-7, T+30, 120-day gap), meeting numbers, quorum, agenda rules, the notice text and Word file, `.ics` invites and signed director links.
- `checklist/` — the 34-step SPICe+ checklist: per-step validation, gating, review, locks, responses and Part A sections.
- `client/` — client overview, home (`/api/client/home`) and progress-board shapes, shared by the portal and the legacy client views.
- `client-portal/` — the v7 client portal's pure models (answers, compliances, credentials, documents, steps).
- `compliance/` — the recurring compliance calendar: FY periods, obligation instances and the filings register.
- `compliance-tasks/` — the statutory and non-statutory model: stages and status words, reminders, repeats, progress steps, the reminder email.
- `doc-pack/` — the incorporation document pack registry, inputs and what blocks each document.
- `documents/` — vault and milestone document visibility rules and storage keys.
- `email/` — outbound email (`send-email.ts`, the system of record), layout and engagement event mail.
- `incorporation/` — incorporation answers outside the checklist itself: directors, DIR-2, pre-inc direct flow, NIC-2008, countries.
- `incorporation-docs/` — generators for the MCA incorporation documents (MOA, AOA, INC-9, DIR-2, DIR-8 and letters).
- `intern/` — the project lead's (intern role) dashboard, work queue, managers and personal todos.
- `knowledge-bank/` — knowledge bank folders, search and storage keys.
- `labour-registers/` — statutory labour registers: the form catalogue for a state and period, column and value matching against a client's payroll sheet, the per-day attendance block, content-addressed caching of generated documents, and the section 14 overtime scoping. Gotchas: `docs/context/notes/labour-registers.md`.
- `noc/` — the parent company NOC (Pre-2 board resolution) templates and variants.
- `notifications/` — in-app bell, announcements, popup cadence and the dock animation.
- `notes/` — the wire type of a staff note on a client record (G-19).
- `notify/` — WhatsApp nudges (outbound only; never blocks email).
- `watch/` — official updates: the polite crawler, source adapters, the one model step, the code check, and publishing by fixed rules.
- `obligations/` — the obligation About wire type and the due rule in one plain sentence (G-04).
- `outlook/` — Microsoft Outlook OAuth and token encryption for sending mail as a user.
- `projects/` — engagements (projects): create scope, DB helpers, change requests, step paths, stuck rules, schedule windows, deadlines and pending approvals.
- `registrations/` — registration facts (number, certificate, issue date, expiry, renewal) built from the step answers and the workbook's reg rows (G-05, G-06).
- `shell/` — app chrome: shell appearance, brand name, motion presets, phase colours and page metadata.
- `super/` — the super admin overview shape builder.

## Top-level files

Generic helpers used across areas: `utils.ts` (`cn`), `auth.ts` (role helpers such as
`isFirmWideAdmin`), `auth-routes.ts`, `slug.ts`, `site-url.ts`, `person-name.ts`,
`toast-errors.ts`, `toast-style.ts`, `upload-limits.ts`, `account-avatar.ts`, `credentials-crypto.ts`.
`dev-allowed-origins.test.ts` checks `next.config.mjs`.
