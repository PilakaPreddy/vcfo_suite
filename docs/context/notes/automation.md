# Automation wave 2 (IDEAS-PLAN A to F)

Gotchas for the six automation features built overnight on 2026-11-10 (commit 0562b79 on
`claude/dreamy-feynman-efzt1s`). The plan and the status table are in
`docs/specs/automation/IDEAS-PLAN.md`. Append when something costs more than a minute.

## Shared rules

- One migration, `0051_automation`, creates all eight new tables (`request_lists`,
  `request_list_items`, `expiry_items`, `expiry_alerts`, `notice_cases`, `company_events`,
  `client_health_scores`, `sla_escalations`). It is additive. It must be applied on RDS before
  deploy. Nothing in this wave has been run against a real database or Inngest yet.
- The schema files (`src/db/schema-{request-lists,expiries,notices,compliance-events,client-health}.ts`)
  are re-exported from `src/db/schema.ts`. Repositories import from `@/db/schema`.
- Every page is one view for every staff role (and for the client where it applies). The route
  files under `app/app/<role>/...` only pass a `basePath`; `AuthContext` decides the rows.
- Approval tiers follow `docs/context/notes/ask-do.md`. T1 runs at once and changes nothing
  outside a private draft. T2 is a review card that changes the firm's own records. T3 is a
  review card that reaches a client and lists the recipients.
- Every job uses `withRunNow` and `skipWhenPaused` (`src/jobs/dev-controls.ts`), so it can be
  started from the developer console's Jobs page and stops while "Pause all jobs" is on. Each job
  is registered in `app/api/inngest/route.ts` and `src/lib/dev/jobs-registry.ts`.
- Email through `sendEmail` is the system of record. WhatsApp is used only by the request list
  reminders, and it is queued after the email so it can never block it.

## A. Client request lists

- **What it does.** A "please send" list for one client, started from a template (GST monthly,
  TDS quarterly, ROC annual, audit PBC, incorporation documents) or by hand. Items are a
  document, an answer or a confirmation. The client answers from the portal, and reminders run
  until every item is in.
- **Code.** Templates in `src/data/request-templates.ts`; rules in `src/lib/request-lists/`
  (`model.ts`, `emails.ts`); repository `src/db/repositories/request-lists.ts`; routes under
  `app/api/request-lists/`; one page `src/views/request-lists/RequestListsPage.tsx` at
  `/app/<role>/requests` for staff and `/app/client/requests` for the client.
- **Approval points.** `requests.createListFromTemplate` (T2) makes a draft. `requests.sendList`
  (T3) shows the exact recipients and the items, and nothing goes out until "Approve and send".
  The server runs the checks again at that click. The reminders follow from that one approval.
- **Job.** `request-list-reminders`, hourly (`0 * * * *`). It sends only between 09:00 and 18:59
  India time, every `cadence_days`, and at most eight times. WhatsApp joins from the second
  reminder for members who opted in. After the third reminder the lead gets one "call the
  client" task and a bell. A list completes on its own when every item is received.
- **Gotchas.**
  - A document item becomes an ordinary document request when the list is sent, so the client
    uploads it on the Documents page and the list reconciles item status from
    `document_requests` as it reads (`itemStatusFromDocumentRequest`).
  - An item counts as done once received, even before staff accept it, so reminders stop then.
  - A rejected upload maps to `cancelled` on the document request. The client cannot upload
    again until staff add a new item.
  - Opening a compliance period does not create its draft list yet, and the project page has no
    Requests tab yet.

## B. Expiry tracker

- **What it does.** One register of DSCs, DIR-3 KYC and registration renewals (GST, PF, ESI, PT,
  shops, FSSAI, trade licence, IEC, MSME, LEI, other), banded red (expired or 7 days or fewer),
  amber (within 30 days) and green.
- **Code.** `src/lib/expiries/` (`model.ts`, `seed.ts`, `alerts.ts`); repository
  `src/db/repositories/expiry-items.ts`; routes `app/api/expiries/`; page
  `src/views/expiries/ExpiriesPage.tsx` at `/app/<role>/compliances/expiries`, with "Mark
  renewed" and "Add item".
- **Approval points.** `registrations.setExpiry` (T2) adds or updates a date from Ask. The job
  never contacts a client: the draft client request it opens waits for a person to send it.
- **Job.** `expiry-alerts`, daily at 07:40 India time. It first seeds items from the checklist
  DSC answers, the credentials workbook "reg" rows and the current directors, then raises each
  stage that is due (T-60, T-30, T-7, expired): one renewal task for the lead, a draft request
  list, bells for the lead (and the manager at T-7 and on expiry) and the emails. The alert also says when a DSC lapses before an upcoming unfiled filing (read through `getFilings` as the lead).
- **Gotchas.**
  - The seed keeps dates set by hand. DIR-3 KYC items are inserted once and never synced, so a
    missed 30 September stays red; the next year's date comes only from "Mark renewed".
  - An LEI with only a registration date renews yearly from it (`leiNextExpiry`), so a lapsed LEI
    can show as current.
  - FSSAI and trade licence dates only come in by hand or from Ask. There is no WhatsApp nudge
    for expiries.

- Backlog guard: an item that has never alerted and expired more than 30 days ago (`isExpiryBacklog` in `src/lib/expiries/model.ts`) is closed quietly at the expired stage by `systemListDueExpiryAlerts`. It opens no task, draft, bell or email; the Expiries page still shows it in red.
- A changed expiry date (by hand, from Ask, or from the backfill) clears `requestListId` with the alert stages, so the next cycle opens a fresh renewal draft.
- Clients read the register without `notes` and `requestListId`.
- `findExpiryItem` matches an exact name, else one unique whole-word prefix ("Ravi" finds "Ravi Kumar", not "Ravindra Singh"). Several matches, or a name with no Latin letters or digits, hold the `registrations.setExpiry` card. The card names the stored person whose date changes.

## C. Notice desk

- **What it does.** A GST, income tax, TDS or MCA notice becomes a case with its section, period,
  DIN, demand, due and hearing dates, stage and owner. A reply and its document list are drafted
  from the notice and the knowledge bank.
- **Code.** `src/lib/notices/` (`model.ts`, `read-notice.ts`, `draft-reply.ts`,
  `escalations.ts`); repository `src/db/repositories/notice-cases.ts`; routes `app/api/notices/`;
  views `src/views/notices/` (`NoticesPage`, `NoticeIntake`, `NoticeDrawer`) at
  `/app/<role>/compliances/notices`. Staff only. The Ask drop router has a `tax_notice`
  destination (`src/lib/ask/drop/classify.ts`), so a dropped notice opens a case card.
- **Approval points.** `compliance.openNotice` (T2) is "Open case" after the person checks the
  fields the reader filled. `compliance.draftNoticeReply` (T1) writes a private draft only.
  `compliance.requestNoticeDocuments` (T3) turns the document list into a client request list and
  shows the recipients first. Moving a case to submitted or closed is the partner's approval, so
  only admins and managers see those stages.
- **Job.** `notice-escalations`, daily at 08:10 India time. Seven and two days before the reply
  is due the owner and the manager get a bell and an email; once overdue the partner does too.
  Nothing goes to a client.
- **Gotchas.**
  - The reader uses the Ask ingest text (`extractSourceText`) and one small-model call. Values
    must appear in the notice text or they stay empty; dates and the demand are parsed by code.
  - Each escalation is claimed once per due date, so an overdue notice escalates only once.
  - There is no client portal view, no digest section, and tests only for `compliance.requestNoticeDocuments` among the three notice actions.

- A case whose request list is still live (any status but cancelled) holds a second "Ask the client" approval, so the client never gets a second list and a second set of reminders.

## D. Company events

- **What it does.** A director appointed or resigned, a registered office change, an auditor
  appointment, a share allotment, an increase in authorised capital or a resolution needing
  MGT-14 starts its MCA form with the legal due date, a task and a draft client request.
- **Code.** Rule table `src/data/event-triggers.ts`; `src/lib/compliance-events/` (`detect.ts`,
  `plan.ts`, `record-change-hook.ts`); repository `src/db/repositories/compliance-events.ts`;
  routes `app/api/compliance-events/`; page `src/views/compliance-events/EventsPage.tsx` at
  `/app/<role>/compliances/events`.
- **Approval points.** A checklist save after incorporation only proposes an event (no task).
  `filing.recordEvent` (T2) is the review card: approving it creates the task and the draft
  request. Staff can record an event by hand through the same card, and Ask can propose one.
- **Job.** None. The checklist save hook in `src/lib/incorporation/apply-checklist-patch.ts`
  runs inline, never throws, and logs a failure so the save stands.
- **Gotchas.**
  - The table is **`company_events`** (export `companyEvents`, type `CompanyEventRow`), but the
    folders, routes and repository are still named `compliance-events`. The older
    `compliance_events` table holds the manual ROC and FEMA filings and is a different thing.
    Someone should decide whether to merge the two.
  - Detection compares with the baseline kept on an open proposal, so a run of autosaves ends as
    one proposal and typing the old value back withdraws it. A first answer is never a change.
  - Board-meeting agenda items and the client change-request save do not propose events yet.

## E. Client health and the SLA ladder

- **What it does.** Each night every live client gets a score out of 100 and a band. Signals
  take points off up to a cap each: oldest open document request, client silence, overdue
  compliances, open notices and stuck steps. A fall of two bands opens a partner check-in task.
  The SLA ladder tells the lead at 1x a stage's SLA, the manager at 2x and the partner at 3x.
- **Code.** `src/lib/client-health/` (`score.ts`, `signals.ts`, `sla.ts`, `nightly.ts`,
  `digest.ts`); SLA days in `src/data/sla.ts`; repository `src/db/repositories/client-health.ts`;
  routes `app/api/client-health/`; chip `src/components/client-health/ClientHealthChip.tsx` on the
  project lists and pages; board `src/views/client-health/ClientHealthBoard.tsx` at
  `/app/<role>/client-health`.
- **Approval points.** `statuses.setClientHealth` (T2) sets a band by hand; only managers and
  admins see that card. The job writes tasks, bells and internal email only.
- **Job.** `client-health-nightly`, daily at 02:10 India time. The weekly digest gains a
  "Client health" section listing At risk and Critical clients.
- **Gotchas.**
  - Late receivables are never counted: receivable sheets belong to client organisations, not
    engagements, so the signal is always null.
  - A client who never replied counts silence from the engagement's creation once a week has
    passed.
  - Each SLA level is recorded in `sla_escalations` once per item and stage clock, so a retry or
    the next night does not repeat it.

- First sighting of a clock (no `sla_escalations` row for its item and stage label): every level reached is recorded, but only the highest is sent. A breach that began more than 30 days before it is first seen (`SLA_BACKLOG_DAYS`) is recorded and sent to nobody, so the first night after deploy does not flood the partner. The health board still shows those items.

## F. My day

- **What it does.** A ranked plan per staff member: overdue, due today, approvals waiting,
  client replies, expiries and notices within seven days, and stalled request lists.
- **Code.** `src/lib/my-day/` (`gather.ts`, `rank.ts`, `email.ts`); repository
  `src/db/repositories/my-day.ts`; `GET /api/my-day`; card `src/views/my-day/MyDayCard.tsx` on
  every staff home, including the super admin overview; Ask tool `getMyDay`
  (`src/lib/ask/tools/my-day.ts`, `MY_DAY_TOOLS` in `src/lib/ask/pipeline.ts`).
- **Approval points.** None. It only reads, through the person's own scoped repositories.
- **Job.** `my-day-email`, weekdays at 08:40 India time, only for staff who turned on "My day
  email" in Settings (off by default), after their quiet hours. An empty plan sends nothing.
- **Gotchas.**
  - The card, the email and Ask share `rank.ts`, so change the order there and nowhere else.
  - A source that fails or refuses is left out and logged rather than failing the plan.
  - The admin's count of overdue filings is not capped, although the card shows the top eight.
