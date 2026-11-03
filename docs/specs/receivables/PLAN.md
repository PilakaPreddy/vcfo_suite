# Receivables — build plan and owner decisions

Owner: Farhath. Approved prototype: `docs/specs/receivables/receivables-prototype.html` (3 Nov 2026).
This file is the spec the code follows. Status on 3 Nov 2026: Phases 1 to 6 built (not committed, migration 0037 local only; 4b, reply in the same thread, deferred; in 6 the HSBC request waits for Summit's onboarding pack, and statement import works today); Phase 7 not started.

## Why

SBC rebuilds the client's receivable summary every Sunday and emails it on Monday. Client partners
who need it mid-week get a stale sheet. After this build, SBC's one manager updates the sheet when
money lands, clicks Update, and the client page at `app.sbctrack.in/receivables` is current for
anyone who opens it. Email is optional, and reminders go out on their own.

## Decisions (owner, 3 Nov 2026)

- Two routes. `/receivables` is the client page: no login, read-only, published version only, with
  a client partner filter. `/receivables/manager` is the only login (the manager connects Outlook).
- No owner role. One manager does all the work. One client organisation (Summit Consulting) for now.
- The sheet keeps the current layout (month blocks, totals, days overdue), but each row is one
  invoice and the invoice number is optional.
- Update publishes. The client page never shows unpublished edits.
- Send email uses today's wording and tables, sends from the manager's Outlook, and allows any
  address in To, Cc and Bcc. Share offers copy link, WhatsApp (wa.me), email, PDF and Excel.
- Reminders go to the invoice's client partner: 5 days before due, 3 days before, on the due date,
  then every day after until Received. The 08:00 queue is visible and the manager can skip or
  edit; the rest sends at 09:00 IST on its own.
- HSBC credits: the prototype simulated the feed. The real feed needs Summit to enrol with HSBC
  (see Phase 6).

## Decisions taken for Phase 1 (owner, 3 Nov 2026: "start Phase 1" with the recommendations)

1. **Public link: secret key, chosen.** Plain `/receivables` is readable by anyone who finds it. Recommended: keep the
   short link but require a secret key (`/receivables/k/<key>`, resettable by the manager), so the
   plain URL shows a "use the link SBC sent you" page. The code supports both through a
   `require_key` flag on the sheet.
2. **Manager: an existing manager profile, chosen.** The sheet's `manager_user_id` points at an
   existing manager (for example krishna@sbcllp.in). Firm-wide admins can also open it.
3. **Starting data: one-time import, chosen.** `npm run receivables:import` reads the current
   workbook, splits summed cells into one row per invoice, and publishes nothing; the manager
   reviews it before the first Update.

## Routes and access

| Path | Who | How it is guarded |
|---|---|---|
| `/receivables` (and `/receivables/k/[key]`) | Anyone | Outside the `proxy.ts` matcher, like `app/meeting-reply`. Server page, `dynamic = 'force-dynamic'`, reads only the latest published version through a `system*` repository call. |
| `/receivables/manager/*` | The sheet's manager, plus `isFirmWideAdmin` | Server layout calls `requireAuth()` and `assertSheetManager(ctx)`, and redirects to `/login?next=/receivables/manager` when signed out. Add `/receivables/manager/:path*` to the `proxy.ts` matcher so the redirect also happens at the edge. |
| `app/api/receivables/*` | Same as the manager | Every route calls `requireAuth()`; every repository method takes `ctx` first. |
| `app/api/public/receivables/export` | Anyone with the page | Rate limited with `createRateLimiter` (as in `app/api/public/board-meetings/reply`), and honours `require_key`. |

The manager area renders its own light header and tabs (Sheet, From HSBC, Reminders, Partners,
Versions), not the staff `AppShell`. That matches the prototype and avoids duplicate navigation.
`managerItems()` in `src/components/shell/sidebar-items.ts` gets one "Receivables" link to it.

## Data (migration `0037_receivables`, new `src/db/schema-receivables.ts`)

- `receivable_sheets`: name, client org name, `manager_user_id` (profiles), `public_key`,
  `require_key`, `published_version_id`, reminder rules (jsonb: offsets `[5,3,0]`, daily after due,
  skip weekends), send hour (9), timestamps.
- `receivable_partners`: sheet, name, email, slug (for `?partner=`), active.
- `receivable_invoices`: sheet, invoice month (first of month), client name, invoice no. (nullable),
  partner, due date, amount INR `numeric(14,2)`, currency, FX amount and rate (nullable), status
  `open|received`, paid on, paid amount, paid via `manual|hsbc`, part-paid total,
  reminders paused until, pause reason, `deleted_at`.
- `receivable_versions`: sheet, published at, published by, note, `snapshot` jsonb (rows as
  published). The client page reads only this, so draft edits never leak.
- `receivable_changes`: an audit row per edit (invoice, actor, field, before, after, at). It also
  gives the "N unpublished changes" count.
- `receivable_reminders`: invoice, partner, for date, kind `pre5|pre3|due|overdue`, status
  `queued|skipped|sent|failed`, subject and body override, sent at, channel `outlook|ses`, error.
  Unique on `(invoice_id, for_date)`, so a reminder can never go twice.
- `bank_credits`: sheet, source `hsbc_api|alert_email|manual`, external ref (unique), value date,
  payer, currency, FX amount, INR amount, narration, matched invoice, status
  `auto|to_confirm|confirmed|ignored`, match score.
- `receivable_email_sends`: version, to/cc/bcc (jsonb), subject, sent at, by.

Days overdue are never stored. They are worked out at read time from the due date and `todayIst()`,
so the client page keeps counting without an edit. Re-export from `src/db/schema.ts`, then
`npm run db:generate -- --name receivables`.

## Code layout

- `src/db/repositories/receivables/` (`index.ts`, `shared.ts`, `sheets.ts`, `invoices.ts`,
  `versions.ts`, `partners.ts`, `reminders.ts`, `credits.ts`). `shared.ts` holds
  `ReceivablesError` and `assertSheetManager`. The `system*` functions (published sheet for the
  public page, reminder candidates, record send, credit ingest) say in a comment why they skip
  `ctx`. Add a row to the access table in `src/db/repositories/README.md`.
- `src/lib/receivables/`, ported from the prototype's pure functions, with tests beside them:
  `dates.ts` (days left, IST today), `reminder-rule.ts` (`reminderOn`, `nextReminder`,
  `reminderDraft`), `summary-email.ts` (the email table in today's format), `match.ts` (payer
  alias + amount within FX/TDS/bank-charge tolerance), `xlsx.ts` (an exceljs writer; exceljs is
  already a dependency but used only for reading today), `import-workbook.ts` (one-time import).
- `src/views/receivables/`: `ClientPage.tsx`, `manager/` (`SheetTab`, `HsbcTab`, `RemindersTab`,
  `PartnersTab`, `VersionsTab`, `ComposeSummary`, `ShareDialog`, `MarkReceivedDialog`,
  `PauseDialog`, `AddInvoiceDialog`). State lives in `use-*` hooks (React Query), following the
  large-view rule. Use `spectrum-chip`, `spectrum-tabs`, `ui/button-variants` and `DashSection`;
  fork no primitive.
- `app/receivables/page.tsx`, `app/receivables/k/[key]/page.tsx`,
  `app/receivables/manager/{layout,page}.tsx`, and `app/api/receivables/*` route handlers.

## Outlook changes (small, shared)

- `graphSendMail` in `src/lib/outlook/oauth.ts` gains `bcc` (Graph `bccRecipients`).
  `/api/outlook/send` and the receivables send route pass it through.
- New `systemSendMailAs(userId, input)` in `src/db/repositories/outlook-connections.ts`, built on
  the existing `systemAccessToken(userId)`, so the reminder job can send as the manager. Without
  a connection, or on a refresh failure, the job falls back to `sendEmail` (SES/Resend) with
  `replyTo` set to the manager. That keeps email as the system of record.
- Excel attachment: the existing `attachments` (base64) path; the 3 MB per file limit is plenty.
- "Reply in the same thread" is deferred. `/me/sendMail` returns no message id, so it needs the
  draft-then-send Graph flow (`POST /me/messages`, then `/send`, with the id stored for
  `createReply`). It is Phase 4b and optional.
- The existing `ComposeOutgoingEmailHost` has no Bcc and edits plain text only, so
  `ComposeSummary` is a receivables-specific dialog. It reuses `src/lib/email/recipient-input.ts`
  for parsing and `/api/outlook/directory` for suggestions.

## Jobs (Inngest, `TZ=Asia/Kolkata`)

- As built: one hourly job, `receivables-reminders`. An hour before a sheet's send hour it queues
  today's rows from `reminderOn`; from the send hour it sends the queued, not-skipped rows whose
  invoice is still open and records `sent` or `failed`. A missed hour still sends later the same
  day. Reminders are off on a new sheet until the manager turns them on.
- `receivables-bank-fetch` hourly (Phase 6, behind `RECEIVABLES_BANK_FEED`).
- Use `withRunNow` and `skipWhenPaused`, and register each one in `app/api/inngest/route.ts` and
  `src/lib/dev/jobs-registry.ts`.

## Phases

Each phase ends with `npm run check` green and is shown to the owner before the next starts.

1. **Data and logic.** Schema, migration 0037, repositories with cross-tenant tests (a manager of
   another sheet, an intern and a client all get 404/403), and the `src/lib/receivables`
   functions with unit tests (reminder rule edge cases: weekends, paused, received; matcher
   tolerance; email table totals). Seed script for Summit Consulting plus the import script.
2. **Manager area.** Guarded layout, Sheet tab (inline edit, add, mark received, part payment,
   pause, Update/publish, draft count), Partners, Versions. Proxy matcher entry and sidebar link.
3. **Client page.** `/receivables` (and the key route if chosen), partner filter with `?partner=`,
   tiles, month tables, Received this week, Excel download.
4. **Send email and Share.** Bcc in Graph, `ComposeSummary` prefilled from the published version,
   saved recipient lists, Excel attachment, a `receivable_email_sends` log, and the Share dialog
   (copy, wa.me, compose, print-to-PDF, Excel). 4b, optional: reply in the same thread.
5. **Reminders.** Both jobs, `systemSendMailAs` with the SES fallback, Reminders tab (queue, edit,
   skip, rules, paused, history), and a "Next reminder" column on the sheet.
6. **Bank feed** (blocked until Summit enrols with HSBC). A `BankFeed` adapter interface; the HSBC
   Treasury Account Information adapter (certificates and keys in Secrets Manager); the matcher
   wired to `bank_credits`; the From HSBC tab. Until then the tab stays hidden and the manager
   marks Received by hand. Alternative if API onboarding stalls: read HSBCnet credit-alert emails
   through Graph, which needs a new `Mail.Read` scope and a reconnect.
7. **Deploy.** Apply 0037 on RDS, deploy to App Runner, sync Inngest, run the import, the manager
   checks it and publishes, then the client link goes out. Update `docs/context/STATE.md`.

## Verification

- Unit tests: `src/lib/receivables/*.test.ts` and the repository access tests.
- E2E, `e2e/receivables.spec.ts`: `/receivables` renders without a session and shows only the
  published version. `/receivables/manager` redirects to login when signed out. The manager edits a
  row, the client page is unchanged, the manager clicks Update, and the client page shows the edit
  and the new stamp. An intern and a client are refused on `/receivables/manager` and on
  `app/api/receivables/*`.
- Jobs: run each once from the developer Jobs page (`withRunNow`) against seeded data; check that
  a second run sends nothing (unique key), and that marking Received stops the next day's reminder.
- Manual: send a summary to a test mailbox with To, Cc and Bcc, and open the Excel attachment.

## Risks

- Public exposure of client financials if `require_key` stays off (open decision 1).
- Reminders stop if the manager's Outlook disconnects; the SES fallback and a banner on the
  manager page cover it.
- A daily email after the due date may annoy partners; the rules are stored per sheet, so a cap
  (for example every 3 days after 15 days overdue) is a settings change, not code.

## Build plan: Phase 8 (client partner logins)

The owner replaced the public key link with a login for each client partner (3 Nov 2026).

- New role `partner` (`trak_role`, `Role`, `AppRole`). The guards refuse a partner everywhere
  except `requirePartner` and their own account routes. `roleHomePath('partner')` is
  `/receivables`; `postLoginPath` allows `/receivables`. `proxy.ts` matches `/receivables*`:
  signed out goes to `/receivables/login?next=…`; a partner is kept out of `/app` and
  `/receivables/manager`.
- Migration `0038_receivables_partners`: the enum value; `receivable_partners.profile_id`,
  `notify_on_publish`, set-password token hash and expiry, invite stamps; invoice
  `promised_on`, `promised_by`, `promised_at`; new `receivable_invoice_notes`.
- Partners tab: invite, resend, reset password and disable, reusing the set-password token
  pattern of `src/db/repositories/client-team.ts` and `app/set-password`.
- Partner routes follow `src/lib/receivables/partner-wire.ts`. Pages: `/receivables` (own
  invoices of the latest published version, promise to pay, notes, Excel),
  `/receivables/login`, `/receivables/account`.
- `/receivables/k/[key]` and `app/api/public/receivables/export` are retired; reminder emails
  link to `/receivables?invoice=<id>`.
- The manager sheet shows each invoice's promise date and notes, and the manager can reply.
- Publish alerts: after Update, each partner with `notify_on_publish` and a changed invoice
  gets a short email (email path, never blocking the publish).

## Build plan: Phase 9 (foreign currency, reports)

- Migration `0039_receivables_fx`: `fx_rates` (fetched `fbil`/`ecb` rows plus a `manual`
  override that wins), invoice `invoice_date`, `received_fc`, `tds_inr`,
  `tds_certificate_on`, dispute columns; `receivable_credit_notes`; `receivable_firas`.
- `src/lib/receivables/fx-rate-source.ts`: the daily USD/INR reference rate (FBIL; the
  Frankfurter API as the fallback), `forecast.ts` (expected cash by week from due dates,
  promises and each client's days to pay), USD matching in `match.ts` (foreign amount within
  bank-charge tolerance).
- Job `receivables-fx-rates` at 14:30 IST; the manager can override a day's rate.
- Sheet FX columns (USD amount, booked rate, today's INR, change), Mark received with the USD
  received, a Reports tab (ageing, days to pay, cash forecast, FX gain or loss, TDS, FIRA),
  the partner's USD view, and the FX columns in the summary email and the Excel export.
