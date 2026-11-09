# Labour registers — gotchas

What this feature is: a client's payroll inputs in, the prescribed statutory labour registers
out, per state, per month, generated once and afterwards retrieved. It replaces a macro-driven
Excel workbook (`Labour_Registers_<client>_<month>.xlsm`) that took four pasted sheets and wrote
eight registers into four act-wise folders.

Read this before changing anything under `src/data/labour-registers/`,
`src/lib/labour-registers/` or `src/db/repositories/labour-registers.ts`.

## The research behind it, and how much to trust it

The design follows five research threads run on 2 November 2026, whose notes are in
`research_notes/Labour register tooling benchmark/`. **Every thread ran without access to
primary sources** — the session's network policy blocked indiacode.nic.in, labour.gov.in,
shramsuvidha.gov.in, the state labour departments, AWS's own docs and every vendor
documentation host. So the legal findings are web-search mediated, no gazette text or
prescribed form PDF was read, and the form layouts here come from filed client workbooks
rather than from the forms themselves.

That is why every `FormSpec` carries a `verification` field and the generator prints it on the
document. Do not quietly upgrade a form to `gazette-verified`; it means somebody read the
gazette.

Before go-live the firm's counsel needs to settle: who signs each register, whether a seal is
needed, whether pages must be initialled, the Kerala and Haryana form numbering, and whether
any of the four states requires a bound paper or local-language register.

## The things that will bite

**A form number is not an identity.** Form XXII is the Register of Employment in Telangana, the
Register of Advances under the central Contract Labour rules, and the register of hours of work
in Goa. Form X and Form D are similarly overloaded. Everything keys on `FormSpec.id`; nothing
keys on `formNumber`.

**Three form names in the first draft of this feature were wrong.** Kerala has no Form XIV
register (its set is A, B, BB and F — "XIV" is a section heading in the Act). Haryana's wage
register is Form D with deductions in Form E; XIII and XIV are central Contract Labour forms.
And Form D under the Equal Remuneration Act stops on 20 November 2025, the Act having been
repealed by section 69(1) of the Code on Wages; no successor register was found, so gender-wise
remuneration is carried in the Code on Wages Form IV columns instead.

**Both stacks apply.** The four labour codes commenced 21 November 2025 and the central rules
were notified 8 May 2026, but none of Telangana, Karnataka, Kerala or Haryana has notified final
state rules. Clients there owe the central code registers **and** their state's existing
registers for the same month. `formsFor()` returns both, state forms first. A generator that
picked one stack would under-file. Rule 72(3) of the OSH rules is reported to deem the Code on
Wages registers to satisfy the OSH ones, which is the one place a near-duplicate is dropped —
and it is the single most load-bearing unread provision in the catalogue.

**Overtime at twice the ordinary rate is scoped.** Section 14 of the Code on Wages applies to
employees whose minimum rate of wages is fixed under the Code. Most of a professional-services
client's roll sits above any scheduled minimum, and the workbook this replaces applied 2× to
everyone. `computeOvertime()` therefore refuses to produce a figure for an employee whose
coverage is `unknown`, and an undecided employee blocks the close. Do not default it.

**Retention is 3 years on the legacy rules and 5 under the codes**, not the 8 an earlier draft
assumed — that number could not be sourced anywhere and may be contamination from section
128(5) of the Companies Act. Rule 72 also forbids destroying a register after its period unless
properly transferred, so there is no delete path in the repository at all. `retentionYears()`
drives a review prompt, nothing more.

**Electronic is fine, but only with a printout on demand.** The Labour Laws (Exemption) Act as
amended in 2014 permits electronic registers provided a printout is produced to an inspector on
demand. So the print bundle is a first-class output, not a convenience, and no labour rule found
prescribes a digital signature class — make signing optional, not required.

## Required, optional, and nil (the payroll checklist is gone — 2026-11-03)

There used to be a payroll checklist here: a client's standing list of the pay heads their
payroll runs, which gated which columns the mapper demanded. It has been removed at the owner's
instruction — it is a payroll concern, not a register one, and belongs in its own feature. The
tables (`labour_register_checklist`, `labour_register_checklist_ticks`) are dropped by migration
`0036`, and `ColumnSource` no longer has a `checklist` member.

What the gating does now, which is simpler and holds the same line:

- A field every payroll has — identity, days worked, basic, gross, deductions — is **required**.
  `requiredFields(forms)` returns these, and an unmapped one blocks the close.
- A field not every employer runs — a night shift allowance, a conveyance allowance, overtime —
  carries `optional: true` on its `FieldSpec`. `optionalFields(forms)` returns these. They are
  offered to the mapper but never demanded, so a client who pays no night shift allowance is
  not held up over a column they will never fill.
- An optional column with nothing mapped to it **still prints**, with a nil in it
  (`nilColumns(form, mappedFields)`). Removing it would alter a statutory layout, and an
  electronic register may change layout but not "integrity, serial number and column contents".
  `assessReadiness` reports these as a short line so nothing goes out blank silently.

So the distinction moved from "did somebody tick this head" to "is this field one every payroll
has". That is the same judgement without a second thing to keep in sync, and it cannot go stale
the way a standing checklist does.

## The monthly close is a lock, not a save

Nothing is generated until somebody marks the inputs ready. Before that the batch is being
gathered; after it the uploads and the mapping are fixed, and the registers are built from
exactly what was locked. `recordDocument` refuses on an unlocked batch for that reason — a
register built from a half-gathered month looks exactly like a finished one, and the only way
to tell them apart is to open the file.

`assessReadiness()` decides what blocks and what is merely short, and the distinction is the
interesting part:

- **Blocks:** no paysheet; no attendance where a form carries a day grid; a required column
  nobody mapped; an attendance code nobody matched; an employee with no minimum wage coverage
  decision where overtime was worked. Each would put a figure in a statutory register that the
  firm cannot stand behind.
- **Does not block:** employees missing a field, optional columns that will print nil, a month
  marked fully present rather than uploaded. These are judgement calls — a client really may
  have two people with no PAN on file — so they are reported, the preparer decides, and the
  decision is on the record.

The readiness summary is stored on the batch verbatim at the moment of locking
(`readiness_snapshot`). What somebody was told when they took responsibility is part of the
record; recomputing it later answers a different question.

Reopening is the only way back and it takes a reason (`reopen_reason`, `reopen_count`).
Documents already generated are left alone: they keep their content address, so unchanged
inputs mean the same files answer and nothing is rebuilt.

`batchProvenance()` is that record said out loud — who locked it, when, how many registers
exist and how many were served from storage rather than built. A saving nobody can see is a
saving nobody believes.

## Caching: two lifecycles, not one

`draftKey()` addresses a **draft** by everything that determines its bytes: the data, the active
heads, the assumptions, the template version, the locale, the time zone and
`GENERATOR_REVISION`. **Bump `GENERATOR_REVISION` whenever a writer's output changes.** A fix
then changes the address, the stale object stops being asked for, and nothing is invalidated by
hand.

An **attested** document is frozen. `attestDocument()` is the only way in and there is no way
out: a correction is a new row whose `supersedesId` points at the old one, and the old file stays
downloadable. Zoho Books' e-invoicing works the same way in India.

If the reported hash requirement in section 63 of the Bharatiya Sakshya Adhiniyam 2023 is right —
every citation found for it was secondary commentary — the admissibility certificate for an
electronic record must disclose a hash value. `EvidenceManifest.artifactSha256` is stored for
that reason, as its own field rather than something to recompute later. Verify the enacted text
before relying on it.

Cold storage is the wrong lever here. At register scale (many small files, tens of gigabytes)
archive tiering saves pennies and adds hours of retrieval latency to exactly the file an
inspector just asked for. Avoiding regeneration is the saving; tiering is not.

## Parsing a client's workbook

`exceljs` does all the spreadsheet work. Two things it cannot answer are in `parse.ts`:

- **Which row holds the headings.** The filed workbooks use row 4 for the paysheet, row 3 for
  attendance and overtime, and row 2 for employee details. A fixed header row misreads three of
  the four.
- **Beware merged banners.** exceljs reports a merged cell's value in *every* column it spans,
  so an instruction row read as 69 perfectly good headings and beat the real heading row four
  rows below. `headerScore()` weights by distinctness for exactly this reason; a banner is one
  value repeated, headings are nearly all different. Do not remove that factor.

## The per-day attendance block

No dedicated import product handles a repeating column group — Flatfile, OneSchema, Dromo,
CSVbox and nuvo all map one heading to one field. It is solved a layer earlier, as an explicit
unpivot on the preview. `detectAttendanceGrid()` finds the run of date headings, tolerates one
stray subtotal inside it, and reports `ambiguous` when the headings could be read day-first or
month-first — in which case **ask**, because 03/04/2026 is two different days.

## Matching, and why there is no percentage on screen

Every shipped importer hides the number: OneSchema stars an automatic match, Flatfile leaves the
destination blank when it is unsure. A score of "71%" implies a precision this matcher cannot
claim. `FieldMatch` therefore carries a three-state `bucket` and a reason, and the score stays
internal for ordering and tests. Spectrum's rule that there are six status words and no others
points the same way: a match state is not a work status, so it must not wear a status chip.

Other conventions taken from the research, all of them design consensus rather than measured
fact (there is no published usability research or accuracy benchmark for this screen at all):
three candidates not one, one source column used at most once, remembered mappings scoped to the
engagement rather than a browser, and a changed-shape diff — which no vendor offers, and which
for a monthly filing is the most useful line on the page.

## Why there is no India map

The first design had a clickable India map. It was dropped on three grounds. Survey of India
remains the arbiter of maps depicting state and national boundaries; apps have been removed from
stores over boundary depiction (Ablo, April 2025; Maps.me, January 2025) and a police case was
brought over a careers-page map. Every freely licensed asset checked was unusable: the one
originally used still showed Jammu and Kashmir with no Ladakh, DataMeet still has Telangana
inside Andhra Pradesh, GADM bars commercial use, and OpenStreetMap is on record refusing to
depict India's claimed boundaries. And the usability case was weak anyway — India's smallest
targets are also high-volume compliance jurisdictions, so WCAG 2.2 target sizes cannot be met at
form scale.

A grouped, keyboard-navigable list is the control. **Do not add the map back** without counsel
sign-off on the boundary depiction and a licence that permits commercial use.


## The screens' own design tokens (2026-11-03)

The labour register screens do not use Spectrum. They use the reference design the owner
supplied, which is a different system on nearly every count: `#1660d8` rather than the blurple,
12 px cards with a single hairline and no shadow rather than 6 px with 2 px, 44 px controls
rather than 36, content-width chips rather than the fixed 104, the system font stack rather
than Roboto, and no ribbon.

Those values live in `src/components/labour-registers/theme.ts` as custom properties and are
applied by `LabourRegistersTheme`, which wraps each screen. They are **scoped to this feature
on purpose**: putting them in `app/globals.css` or `tailwind.config.ts` would repaint
incorporation, the compliance calendar, the client portal and all six shells — every screen in
the product, most of which nobody has looked at in this light.

The feature therefore has its own `LrCard`, `LrCardHead`, `LrHero`, `LrChip`, `LrStatTile` and
`LrBanner` in `primitives.tsx`, which is a fork of `DashHero` / `DashSection` / `Chip` and is
the one place the house rule against forking a primitive is deliberately broken. A `variant`
prop on the shared components would have carried the reference's values into every other
screen's props. A unit test in `labour-registers-page.test.ts` fails if anything outside the
feature folder imports `theme.ts`, which is what keeps the scoping true.

If the whole product ever moves to these values, delete `theme.ts` and the `LabourRegistersTheme`
wrappers and the components fall back to the shared tokens.

### Screens

- `LabourRegistersPage` — the staff picker: hero and figures, the India map beside a list of the
  same states, the side rail, then the catalogue act by act.
- `ClientRegistersPage` — the client's own view. A separate screen, not the staff one with
  buttons removed: a client asks "where do I employ people, and can I have last month's file",
  which needs their establishments first and a download beside each register.
- `BatchPage` — one batch: the provenance card (with the reopen and download actions in its
  footer), what the batch cost, then the registers laid out as the folders they download as
  (`ActDirectory`).

### Verifying a change here

jsdom will not catch the failure these screens are prone to. They hand Lucide icons to client
components, and a function cannot cross the server-to-client boundary, so a screen that loses
its `'use client'` throws on every request while every unit test still passes. Render through
the real pipeline: `npm run e2e:smoke`, or a throwaway page under `app/` requested from a
running `next dev` and screenshotted.


## Opening a batch (2026-11-03)

The picker is state-first: a preparer thinks "Telangana, September" before they think of a
client. But a batch is one client, one state, one period, so the client is chosen on the same
screen and `POST /api/labour-registers/open` puts the three together. `openBatch` is
find-or-create, so pressing the button twice returns the same batch rather than a second one.

Before that route existed the Open button was a link back to the same page, which is why
pressing it appeared to do nothing.

## The map's hit areas

Every configured state is clickable on its own shape (an `onClick` on the `<g>`, which pushes
the picker's own href). The small ones — Delhi, Chandigarh, Goa, Sikkim, Puducherry, the
islands — also get a marker with a 44 px hit area over it, because their shapes are a few
pixels across at page scale.

**That overlay list must keep `pointer-events-none`.** It covers the whole map, and without it
the list swallowed every click meant for a shape underneath, so clicking a large state did
nothing. Only the links inside it take the pointer back (`pointer-events-auto`).

The `<svg>` stays `aria-hidden` and its shapes are not focusable: a path is a poor focus target
and announces nothing useful. The list of states the caller renders beside the map is the
keyboard and screen-reader path, and both read the same rows.

## Sheets that arrive through Ask VCFO (2026-11-09)

A project lead can drop payroll and attendance sheets, a folder or a ZIP into Ask VCFO, and each sheet becomes a
`labour.uploadSheet` row on that client's review card (`src/lib/actions/labour/upload-sheet.ts`). Nothing is stored
until the row is accepted.

- **One upload path.** The upload route and the chat action both call `ingestRegisterUpload` in
  `src/lib/labour-registers/ingest-upload.ts` (parse, sha256, `putObject` under `labour-registers/{eng}/{batch}/`,
  `recordUpload`). Change the upload rules there, not in the route.
- **A closed month refuses the row.** The card's recheck and the action's execute both look at the batch's
  `markedReadyAt`, the same lock the batch screen uses. Undo is refused once the month is closed.
- **A full slot is replaced.** The card says "replaces X". Undo restores the previous upload (`restoreUpload`), or
  removes the new one (`removeUpload`) when the slot was empty.
- **The state may be a guess.** When neither a reply, the folder or file names, nor an earlier batch gives the state,
  the registered office's state is used and flagged `stateAssumed`; the card shows "(assumed from the registered
  office)". A state from the folder or file names that the client has never filed in is flagged "new for this client:
  please check" (`stateNew`). Either way the lead can change the state on the card: "Edit" on a labour row offers the
  list of states, and the row is checked again for the new state before it can be accepted.
- **The month** comes from the attendance grid's dates when they settle it, then from names such as `Aug-2026` in the
  file or folder names (`src/lib/labour-registers/period-hint.ts`). A paysheet has no dates of its own, so a lone
  paysheet named only `pay.xlsx` waits for "Where should these go?".
