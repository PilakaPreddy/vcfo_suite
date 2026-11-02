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
coverage is `unknown`, and `minimum-wage-coverage` is a payroll checklist head so the question
is part of the monthly close. Do not default it.

**Retention is 3 years on the legacy rules and 5 under the codes**, not the 8 an earlier draft
assumed — that number could not be sourced anywhere and may be contamination from section
128(5) of the Companies Act. Rule 72 also forbids destroying a register after its period unless
properly transferred, so there is no delete path in the repository at all. `retentionYears()`
drives a review prompt, nothing more.

**Electronic is fine, but only with a printout on demand.** The Labour Laws (Exemption) Act as
amended in 2014 permits electronic registers provided a printout is produced to an inspector on
demand. So the print bundle is a first-class output, not a convenience, and no labour rule found
prescribes a digital signature class — make signing optional, not required.

## The payroll checklist is load-bearing

`labour_register_checklist` is the client's standing list of pay heads and activities. It is
also what decides which columns the mapper demands. Two ways a column can be absent, and the
difference is legal:

- A column the **prescribed form** carries always prints, with a nil in it when the head is off
  (`nilColumns()`). Removing it would alter a statutory layout, and an electronic register may
  change layout but not "integrity, serial number and column contents".
- A column the **catalogue itself** marks `source: 'checklist'` simply does not appear
  (`omittedColumns()`).

A field can be gated from either side — by `FormColumn.requiresHead` or by the field's own
`FieldSpec.head` — and `requiredFields()` honours both. A prescribed form names an overtime
column outright, so that gate lives on the field.

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
