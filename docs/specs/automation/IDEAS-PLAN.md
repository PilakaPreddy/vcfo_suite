# Automation ideas and the overnight build (2026-11-09)

The owner wants every routine task, and every point where a person types, chases or copies something routine, to be automated, with approval kept wherever the firm's data or a client is affected. This file has two parts:

- the researched list of ideas;
- the subset built overnight after the Ask VCFO drop feature (`docs/specs/ask-vcfo/DROP-PLAN.md`).

The research looked at how practice and compliance tools handle the same work: Karbon, TaxDome, Canopy, Financial Cents, Jetpack Workflow, Ignition, Suralink, Dext, Suvit, Clear, Zoho Practice, Vider, Infyner, Vanta and others. Sources are at the end.

## Every idea

Notation: ★ means it needs no outside account or paid API. Value and effort are H/M/L and S/M/L. "Built" means it is in the overnight build.

| # | Idea | What gets automated (approval stays with) | Who does it | Extends | Value | Effort |
|---|---|---|---|---|---|---|
| 1★ | Email-in inbox with AI triage | Client mail is labelled, the client is matched, attachments go through the drop router, and replies and tasks are drafted (lead approves) | Karbon Triage, Dext | Ask drop router, tasks, vault | H | M |
| 2★ | **Client request lists with reminders until done** (Built) | Templated "please send" lists that the client answers from a link; reminders by email, then WhatsApp, then a call task for the lead (lead approves the first send) | TaxDome, Financial Cents, Suralink | Client portal, document requests | H | M |
| 3★ | **Expiry tracker: DSC, DIR-3 KYC, registrations** (Built) | One register; alerts at T-60, T-30 and T-7 open a renewal task and a client request; a DSC that expires before a filing is flagged | Infyner, Vider | Registrations, checklist DSC fields | H | S |
| 4★ | **Tax and GST notice desk** (Built) | A notice is read (section, period, DIN, demand, due date) into a case with stages; a reply is drafted (partner approves) | Vider ATOM Pro, ExpressGST | Compliance, knowledge bank, Ask | H | M |
| 5★ | Engagement letters from a service menu | Letter from the rate card; client accepts in the portal; acceptance creates the engagement and its obligations | Ignition, TaxDome | Growth pipeline | H | M |
| 6★ | Billing from work done | Each filed item becomes a billable line; month-end draft invoices (partner approves) | Karbon WIP, Ignition | Receivables | H | M |
| 7★ | Time from activity | The audit log and Outlook calendar become draft timesheets that staff confirm | Karbon, Uku | Audit log, metrics | M | M |
| 8★ | **Computed client health score** (Built) | Nightly score from overdue requests, silence, late payments and missed dues; a drop opens a partner check-in task | AccountingWeb, AI Accountant | `ClientHealth`, digests | M | S |
| 9★ | Recurring job templates | Editing a template carries into future instances | Jetpack, Karbon | Compliance task repeats | M | S |
| 10★ | Capacity planning and auto-assignment | Forecast hours against capacity and propose an assignee (manager approves) | Financial Cents | Team load | M | M |
| 11★ | **SLA escalation ladder** (Built) | A stage breach goes to the lead, then the manager, then the partner, with nudge and reassign actions | Vider, Karbon | Stuck rules, staff alerts | M | S |
| 12★ | Annual ROC pack drafts | After FY close: board meeting, AGM notice, director's report and ADT-1 drafts | Legalwiz | Board meetings, docx | H | M |
| 13★ | **Event-based compliance triggers** (Built) | A director change, address change, auditor appointment or allotment opens the form with its statutory clock and a resolution draft (lead approves) | (gap in most tools) | Calendar, resolutions | H | M |
| 14★ | Bank statement and bill extraction to Tally | PDF lines become a ledger-suggested grid, exported as Tally XML (accountant approves) | Suvit, Dext | Budgets, data router | H | M |
| 15★ | GSTR-2B vs purchase register reconciliation | File-based matching into mismatch buckets, with vendor emails drafted | Clear, Suvit | Compliance | H | M |
| 16★ | 26AS/AIS vs books TDS reconciliation | Mismatches per deductor, with emails drafted | Clear, Saral | TDS obligations | M | M |
| 17★ | Payroll to PF ECR, ESI, PT and 24Q working | Files prepared from the payroll sheet already uploaded | Saral, Zoho Payroll | Labour registers | M | M |
| 18★ | Pre-filing sanity checks | A rule pack blocks "Filed" until the checks are clear or overridden with a reason | Vanta-style | Compliance tasks | M | S |
| 19★ | Continuous compliance status per client | Live controls with evidence; monthly status PDF | Vanta, Drata | Evidence, digests | M | M |
| 20★ | Meeting to tasks | Transcript or notes become minutes, tasks and a follow-up email draft | Karbon Kai | Board meetings, Outlook | M | S |
| 21★ | Regulatory watch to client impact | Updates matched to affected clients, with tasks and advisories drafted | Taxmann | `watch/` | M | S |
| 22★ | Two-way WhatsApp intake | Inbound photos and documents go to the drop router (a policy change: WhatsApp is outbound only today) | Suvit | `notify/` | M | M |
| 23★ | Fee follow-up with promise-to-pay | Escalating reminders; a promised date in a reply pauses them | Ignition | Receivables | M | S |
| 24★ | Onboarding KYC cross-check | Names, PAN and DoB cross-checked across scans before filing | Signzy, IDfy | Checklist fill | M | S |
| 25★ | Client self-serve status Q&A | Portal Ask scoped to the client's own data, with hand-off to the lead | Karbon Kai, TaxDome | Ask, portal | M | M |
| 26★ | **"My day" plan per staff member** (Built) | A morning ranked list of due work, replies to read and approvals waiting | Karbon Triage | Digests, work queue | M | S |
| 27 | Aadhaar eSign and e-stamp | Sign by OTP | Leegality, Digio | Resolutions, letters | H | M (paid vendor) |
| 28 | GST status, 2B and notices via a GSP | Scheduled pulls | Clear, MasterGST | #15 | H | L (GSP) |
| 29 | MCA master data sync | Directors and charges synced; mismatches alerted | Surepass | #13 | M | S (paid API) |
| 30 | Bank feeds via Account Aggregator | Consent-based statement pulls | Sahamati AA | #14 | M | L (regulated) |
| 31 | IT portal and TRACES notice pull | Notices fetched | Vider | #4 | H | L (credentials) |
| 32 | Verified PAN, GSTIN and bank checks | API verification | Signzy, IDfy | Onboarding | L | S (paid) |

## Overnight build (wave 2), in priority order

Rules for the whole wave:

- Each feature reuses the app's existing pieces: repositories with `AuthContext`, Inngest jobs, `sendEmail`, `queueWhatsAppSends`, the action registry and review cards, digests and notifications.
- Nothing outward or record-changing happens without a person's approval.
- One migration, `0051_automation`, covers all new tables.

### A. Client request lists with reminders (#2)
- **Data.** `request_lists` and `request_list_items` (engagement, title, period, status, due date, cadence days, last reminded, reminder count). Items are typed: document, answer or confirmation.
- **Templates.** A template library in `src/data/request-templates.ts`: GST monthly, TDS quarterly, ROC annual, audit PBC, incorporation documents.
- **Staff screen.** A request-list tab on the staff project page.
- **Client side.** Lists appear in the client portal's documents requests area, reusing the existing request upload path. An item can be answered by upload or text, and uploads go to the client's documents.
- **Reminders.** An hourly Inngest job: email every N days, WhatsApp (when opted in) from the second reminder, and a call task for the lead after the third. It stops when every item is received.
- **Ask action.** `requests.sendList` (T3, the card lists the recipients).
- **Auto-creation.** Opening a compliance period can create its template list as a draft.

### B. Expiry tracker (#3)
- **Data.** `expiry_items`: engagement, a person or the company, kind (dsc, dir3_kyc, registration kinds), reference label, expiry date, and source (checklist, manual or Ask).
- **Seeding.** From checklist `dscExpiryDate` answers and the registration certificates already on file, by a backfill job. Ask can add or update an item (`expiry.set`, T2).
- **Daily job.** Alerts at T-60, T-30 and T-7. Each alert opens a renewal task and a draft client request. A DSC that expires before an upcoming filing due date the director must sign is flagged.
- **Screen.** A red/amber/green register on a staff page (Compliances → Expiries).

### C. Notice desk (#4)
- **Data.** `notice_cases`: engagement, authority (GST, income tax, TDS, MCA, other), section, period or AY, DIN, demand, received date, response due date, hearing date, stage, owner, and notes.
- **Intake.** Upload or drop a notice. A Claude read (reusing the data-router reader) fills the fields, and the card creates the case (T2).
- **Reply.** A drafted reply and document list from the knowledge bank and the client's data. The document list can become a request list. The partner approves the final reply.
- **Alerts.** T-7 and T-2 escalations, a notices board across clients, and a digest section.
- **Drop router.** The router learns the "notice" destination, so a dropped notice opens a case card.

### D. Event-based compliance triggers (#13)
- **Rule table.** `src/data/event-triggers.ts`:

  | Event | Form | Within |
  |---|---|---|
  | Director appointed or resigned | DIR-12 | 30 days |
  | Registered office change | INC-22 | 30 days |
  | Auditor appointed | ADT-1 | 15 days |
  | Share allotment | PAS-3 | 15 days |
  | Increase in authorised capital | SH-7 | 30 days |
  | Board resolution needing filing | MGT-14 | 30 days |

  Each rule also names a resolution template and a client request template.
- **Event sources.**
  - Client record edits, by hooking the existing change-request and checklist save paths.
  - Board-meeting agenda items.
  - Ask chat ("Mr X resigned yesterday"), through an `events.record` action (T2).
- **Output.** A review card with the compliance task, its due date, a resolution draft where a generator exists, and a client request.

### E. Client health score and SLA ladder (#8, #11)
- **Nightly job.** Computes the signals per client (oldest open request, days since the last client reply, overdue compliances, late receivables, open notices, stuck steps). It writes a score and band to a new `client_health_scores` table and keeps a manual override. The weights are shown in a tooltip.
- **Partner check-in.** A fall of two bands opens a partner check-in task.
- **SLA ladder.** Per-stage SLA breaches notify the lead, then the manager at twice the SLA, then the partner at three times. Each notice offers nudge-client and reassign links.
- **Digest.** The weekly digest gains a health section.

### F. "My day" plan (#26)
- **Morning job.** Ranks each staff member's day: overdue, due today, approvals waiting, client replies, expiries, notices.
- **Delivery.** A Today page card and an optional email. Ask can answer "plan my day" from the same ranking.

### Deferred, with reasons
- #1 email-in needs an SES inbound receipt rule and a domain MX change (Terraform and DNS), which is an owner step.
- #5 engagement letters and #6 billing touch pricing, which the partners must define.
- #14, #15 and #16 need sample client files to tune extraction.
- #27 to #32 need outside vendors or portal credentials.
- The rest are next in line after the overnight wave.

## Sources
- karbonhq.com (email management, Kai), help.taxdome.com (automatic reminders), taxdome.com/client-requests, suralink.com
- intercom.help/financialcents (client tasks), jetpackworkflow.com (recurrence), ignitionapp.com (engagement letters)
- vider.in (notice management, compliance calendar), infyner.com, expressgst.com, taxscan.in (notice tools 2026)
- suvit.io, dext.com, docs.cleartax.in (2B reconciliation), cleartax.in (26AS)
- leegality.com, digio.in, surepass.io, qorpiq.com, financialservices.gov.in (Account Aggregator)
- vanta.com, accountingweb.co.uk, aiaccountant.com, patronaccounting.com (DIR-3 KYC triennial)
