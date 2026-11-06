# Repository layer — the seam

This folder is the **only** code allowed to touch the database. Views, domain
logic, and API routes call these functions; they never import `db` directly.

## The rule for every repository

1. Take an `AuthContext` (from `src/auth/guards.ts`) as the first argument.
2. Branch on `ctx.role` and filter by the scoping keys — reproducing the old
   Postgres RLS policy for that table (see `docs/context/notes/data-access.md` for the rules as built).
3. Add a test asserting cross-tenant access returns nothing.

`engagements/` is the reference implementation (`scope.ts` holds `scopeFor()`, `index.ts` re-exports the public API). Copy its shape; a small repository stays one file.

## How to add a repository method

1. **Signature.** Make `ctx: AuthContext` (from `@/auth/guards`) the first argument. Only
   `system*` helpers called by Inngest jobs may skip it, and they must say so in a comment.
2. **Role checks.** Never compare `ctx.role === 'admin'` on its own. Use the shared helpers in
   `src/lib/auth.ts`: `isFirmWideAdmin(role)` for "super admin or admin" (firm-wide reads) and
   `isAdminOrManager(role)` for "super admin, admin or manager" (staff writes and unscoped
   rows). A role list written out by hand forgets `super_admin` sooner or later; five
   repositories did until 2026-10-22.
3. **Row scope.** Reuse the engagement scope instead of rebuilding it:
   - a list: `if (isFirmWideAdmin(ctx.role)) return all;` otherwise filter on
     `listScopedEngagementIds(ctx)` and return `[]` without a query when it is empty
     (`document-requests.ts`, `activity.ts`);
   - one row or a write: load the row, then `assertEngagementAccess(ctx, row.engagementId)`
     and return `null` (or throw) when it is not `ok`; write against `access.dbId`, never the
     id the caller sent (`tasks.ts`, `documents.ts`);
   - joins on `engagements`: add `isNull(engagements.deletedAt)` so soft-deleted projects
     stay hidden, as `scopeFor()` does.
4. **Refuse early.** If a role has no access at all (for example clients on a staff-only
   table), throw or return before the first `db` call.
5. **Cross-tenant test.** Add or extend `<file>.test.ts`. Mock `@/db/client` with the chain
   stub from `document-requests.test.ts`, render the captured `WHERE` with `PgDialect`, and
   assert for every role that another firm's engagement id never appears in the parameters,
   that a foreign row reads as `null` / `[]`, and that a foreign write makes no `insert`,
   `update` or `delete` call. Include `super_admin` in the firm-wide cases.
6. **Docs.** Add or update the table row below, then run
   `npx vitest run src/db/repositories/<file>.test.ts` and `npm run typecheck`.

A longer walk-through that also covers routes and migrations is in
`docs/context/HOW-TO-BUILD.md`.

## Access-control rules ported from RLS (Path A)

Verified against the original SQL during Phase 1. Two rows in the first draft
of this table were WRONG and have been corrected — the SQL is the spec, not
this table, so re-check the migration before trusting a row.

| Table | Admin | Manager | Intern | Client | Source migration |
|---|---|---|---|---|---|
| engagements | all | `manager_id = ctx.userId` (legacy: `manager_id` null + `admin_id = ctx.userId`) | `intern_id = ctx.internId` | `client_user_id = ctx.userId OR client_id = ctx.clientId` | four-role + `20260522120000` |
| engagement_board_resolutions | all | via owned engagement | read + insert via assigned engagement; update only while `status = 'draft'` | read via own engagement | `20260525200000_board_resolution.sql` |
| knowledge_bank_files | all | all | **read all** + insert own (`uploaded_by = self`) | **none** | `20260529160000_knowledge_bank.sql` |
| knowledge_bank_folders | all | all | **read all** + insert own (`created_by = self`); **no delete** | **none** | `0013_knowledge_bank_folders.sql` |
| compliance_obligations | all | all | read | read | `20260708120000_compliance_calendar.sql` |
| compliance_instances / _events / _triggers | all | via owned engagement | write via assigned engagement | read-only via own engagement | `20260708120000`, `20260805130000` |
| audit_events | **read: all** | **read: owned/assigned engagements** | **own actor + assigned engagements** | own engagements | four-role + `20260529120000` + product |
| ask_index_items | all | via owned engagement + firm-wide cards | via assigned engagement + firm-wide cards | own engagements, `client` / `both` cards only | `0047` (`ask-index.ts`) |
| ask_saved_answers | staff rows | staff rows | staff rows | `client` rows only | `0047` (`ask-saved-answers.ts`) |
| email_send_log | read | read | none | none | `20260806120000_email_send_log_seeds.sql` |
| engagement_step_events | read: all | read: owned/assigned engagements | read: assigned engagements | **none** | product (G-13); written only inside `updateChecklistState`'s transaction |
| metrics (practice, analytics, people; `metrics.ts`) | all; capacity write | own engagements; people: self + own leads | own engagements; people: none | **none** | product (G-13, G-14, G-27, G-29); reads only through the engagement scope |
| practice incorporation (`practice-incorporation.ts`, R-51) | all | own engagements | assigned engagements | **none** (developer: none) | product (D-29); engagements and checklist through the engagement scope, names and next filing date only for the approved ids |
| firm_settings | read and write (audit per field) | read | read | **none** | `0026_gaps_backend.sql` (G-02) |
| escalations | all; resolve | raise and read on owned engagements | raise and read on assigned engagements | **none** | `0026` (G-20); assignee must be an admin, null means the super admin |
| profiles.reports_to_admin_id (reporting lines, `firm-org.ts`) | read and write | none | none | none | `0026` (G-20); developer accounts are created by the super admin only |
| prospects / saved_reports / demo_requests | **super admin only** (saved reports: owner only) | none | none | none | `0026` (G-21, G-30); the public demo-request insert takes no AuthContext |
| mail_groups / mail_group_members | own + shared; only admins create or change shared groups | own + shared | own + shared | **none** | `0026` (G-23); group ids expand to addresses on the server |
| documents (vault review, preview, zip) | all | owned engagements | assigned engagements | preview and download of shared documents only; no review | `0026` (G-26) |
| client_messages | all | owned engagements | led engagements; triage | own engagements; send and read | `0026` (G-09, G-11) |
| client reminders (`client-reminders.ts`) | all | owned engagements | led engagements | **none** | product (G-15); one per item per 24 hours, read from audit events |
| work-assignments (reassign) | all | owned engagements | **none** | **none** | product (G-18) |
| engagement_notes | all; delete any | owned engagements | assigned engagements | **none** | `0026` (G-19); author edits, author or admin deletes (soft) |
| work_sessions / work_checklist_items / time_blocks / item_window_requests | all | owned engagements; decide requests | led engagements; checklists and blocks are owner-only | **none** | `0026` (G-16, G-17) |
| weekly digest (`weekly-digest.ts`) | system only | system only | system only | system only | product; the Inngest cron lists active people with the digest on (never saved = on, developers never) as their own AuthContext, then reads through the scoped repositories; `notification_deliveries` rows with `event_type = 'weekly_digest'` and the ISO week in `template_sid` |
| user_sessions, profiles.totp_* | own rows; reset another person's two-step | own rows | own rows | own rows | `0026` (G-25); developers reach own-account routes through `requireOwnAccount` |
| home trends (`home-trends.ts`, read only) | super home: firm-wide engagements, filings, delete and reopen audit events; admin, manager and lead homes: no series | manager home: no series | lead home: no series | client home: own engagement's filings and reopen events | product (C-0122, R-18); dev home: developer or super admin only, counts of failed messages and denied events |
| labour_register_* (`labour-registers.ts`) | all | owned engagements | assigned engagements | **read only** (downloads) | product (2 Nov 2026); scope reused from `engagements`; writes staff-only, the close (`markReady`) and reopen are staff with a reason recorded, attestation firm-wide admin only, generation refuses on an unlocked batch, and there is no delete path — an attested register is frozen and a correction supersedes it |
| board_meetings / _events / _versions / _replies / _documents / _signature_events, company_directors (`board-meetings/`) | all | owned engagements; approve, send back and edit a notice waiting for approval | assigned engagements; create, draft, submit, reschedule, cancel, MoM and resolutions; no approval | read a meeting only once its notice is sent; locked documents only; directors without contact details | product (`0034_board_meetings.sql`, docs/specs/board-meetings/PLAN.md); director replies come from signed email links (`systemRecordReply`, no session) |
| receivable_* , bank_credits (`receivables/`) | all sheets | **own sheet only** (`receivable_sheets.manager_user_id`); another manager's sheet reads as not found | **none** | **none** (the client page is public and reads a published snapshot by secret key) | product (`0037_receivables.sql`, docs/specs/receivables/PLAN.md); `systemPublicSheet` serves the public page with no session; reminders and bank credits have `system*` entry points for the Inngest jobs |
| agenda_library_items / agenda_templates | read; edit and import; firm templates | read; client templates in scope | read; client templates in scope | **none** | `0034` |
| dev-* (developer console reads) | **none** | **none** | **none** | **none** | developer and super admin only (`assertDeveloper`); firm-wide, client recipients masked or counted | `0026_gaps_backend.sql` |

Corrections from the first draft:

- **knowledge_bank_files** has no `visible_to_roles` column. Interns can read
  every file and insert their own; clients get nothing at all.
- **knowledge_bank_folders** is nested (`parent_id` null = root). Files sit in
  a folder via `folder_id` (null = root). Delete **refuses non-empty** folders
  (child folders or files) — no cascade. Interns cannot delete folders.
- **audit_events** original RLS was manager-read-only (intern none). Product
  override: intern (Project Lead) sees `actor_user_id = self` plus events on
  assigned engagements (`intern_id` + `engagement_leads`) — that is the
  shared-client trail. Manager still sees only owned/assigned engagements
  (`manager_id` + `engagement_managers` + legacy); unscoped rows are dropped.
  Admin / super_admin remain firm-wide. Inserts: any authenticated user;
  `actor_user_id` is forced to the session user.

`documents`, `tasks`, `document_requests`, `invites`, `activity`,
`notifications`, `outlook_connections`, and `announcements` have no original SQL (they are new, replacing localStorage),
so their rules are a product decision rather than a port. Default to:
super_admin and admin all, manager via owned engagements, intern via assigned engagement,
client via own engagement. Personal todos (LeadFocusCard) reuse `tasks` with
`engagement_id` null, `assigned_to` = owner, and `step_id` prefix `todo:`
(`/api/todos`). Intern: own rows only. Manager: self + leads/co-managers on
scoped engagements + intern reports. Admin / super_admin: firm-wide staff.
Mutate is owner-only. Clients: none. Those rows are excluded from `/api/tasks`.
Documents additionally hide non-shared rows from
clients (`shared_with_client = true` only). `GET /api/documents` without
`engagementId` is the staff vault list — same Path A scope; intern cannot see
another intern’s client files. Notifications stay per-user
(`user_id = ctx.userId`); admin/manager may create for another user.
Clear/dismiss sets `dismissed_at` (inbox hide) and is self-scoped — other
users’ ids in a batch are ignored. History (`GET /api/notifications?history=1`)
returns dismissed + current. Do not hard-delete from the bell.
`outlook_connections` is the signed-in staff user's own Microsoft mailbox
(Graph Mail.Send); clients have no access. `email-directory` lists Outlook
compose recipients from the same engagement scope (+ intern reports-to).
`email_templates` is firm-scoped compose library (SBC branded vs plain):
staff list/create; admin/manager mutate any; intern mutate own; client none.
`announcements` is firm-wide news (not the notification bell): every signed-in
role may read; super_admin / admin / manager may post and delete. Author name
is stored on the row. `announcement_sources` are official RSS/Atom URLs
(allowlisted hosts); Inngest `announcement-feeds` pulls them once each morning IST.
Do not HTML-scrape homepages or login pages. System ingest:
`systemListEnabledAnnouncementSources` / `systemUpsertFeedAnnouncements` /
`systemGetOrCreateAnnouncementSource` (only after a catalog URL parses as a feed)
— job-only, no AuthContext.

Implemented: `engagements`, `knowledge-bank`, `profiles`, `audit-events`,
`board-resolution`, `compliance`, `documents`, `tasks`, `document-requests`,
`activity`, `notifications`, `outlook-connections`, `email-directory`,
`email-templates`, `announcements`.

System jobs (Inngest): `systemGenerateComplianceInstances` /
`runComplianceGenerate` in `compliance.ts`, and feed ingest helpers in
`announcements.ts`, may touch `db` without AuthContext. Routes still must
not import `db`. Staff “Pull now” goes through `ingestAnnouncementSource`.
Work tools (G-16, G-17, `ui/spectrum`): `work-items.ts` turns an item key
(`src/lib/work/item-key.ts`) into an engagement through `assertEngagementAccess` — lead on
the engagements they lead, manager on theirs, admin / super admin all, client and developer
nothing — and every other work repository resolves its item there. `work-sessions` (timer;
everyone in scope reads an item's sessions, a person starts and stops only their own, one
running per person), `work-checklist` (own rows only), `time-blocks` (own rows only; a list
hides blocks on engagements that left the scope) and `item-window-requests` (lead asks on a
step or filing with a manager window; manager / admin decide, approve applies the window
through `schedule.ts`; the asker withdraws). Tests share `work-test-stub.ts`.

Compliance record reads (G-04, G-05, G-06, G-19): `obligation-about` (an obligation's About,
Why it applies and If filed late; firm-wide admins read any, other roles only one with an
instance on a scoped engagement, or by instance id through `assertEngagementAccess`),
`credentials/registrations` (registration facts and renewal dates on the workbook's reg rows,
`fields` only, never the ciphertext; one engagement through `resolveAccess` or every scoped
engagement through a narrow `reg-*` SQL read; staff write the dates, everyone in scope opens
the certificate through a signed URL) and `engagement-notes` (staff only; anyone on the
engagement adds and pins, the author edits, the author or a firm-wide admin soft-deletes;
audit summaries never quote the note because clients read their engagement's audit events).

Statutory and non-statutory Compliances (30 Oct 2026, `docs/ui-port/COMPLIANCE-API.md`):
`compliance-activities` (the 43-row activity master; everyone reads, only firm-wide admins see
and settle the `confirm` point and edit; `systemEnsureActivitiesSeeded` fills it once),
`compliance-tasks/` (non-statutory tasks; staff in scope through `assertEngagementAccess`, a
client only its own tasks with visibility client or both; admin, super admin and manager create,
edit and approve; a lead works and submits; a client comments and uploads),
`compliance-statutory` (the statutory detail payload and workflow side table; staff write, the
client reads without reviewer, review note, confirm point, escalations, ticks or Assist runs),
`compliance-reminder-schedule` (the six reminders per item; admin, super admin and manager edit;
the `system*` readers serve the reminder job only) and `compliance-counts` (category totals in
the same scope). Cross-tenant tests: `compliance-tasks.test.ts`.
