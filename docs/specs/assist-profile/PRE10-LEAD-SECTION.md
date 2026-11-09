# PRE10-LEAD-SECTION — AGILE-PRO-S / INC-33 answers in Suite

Status: **draft, awaiting owner approval** (2026-10-06). No code written yet.
Decided by: `QUESTIONS.md` Q2 answer (2026-09-29) — lead-owned answers in one new
lead section on pre-10; client-owned facts in existing client steps pre-14 / pre-1.

## Goal

Close most of the `EFORM_GAPS` list in `src/lib/assist-profile/build.ts` (today
every entry is `missing` with "Suite does not collect this yet"). After this
change Copy for Assist emits them as values; a blank one becomes an ordinary
reason-less missing item the lead can fill.

Note on files: field definitions live in `src/lib/checklist-responses.ts`, not
`src/data/checklist.ts`. The only `checklist.ts` edit is copy (`infoRequired`,
`description`) on pre-10, pre-14 and pre-1 — no new step, no `itemIds` change.

## Fields

### A. pre-10, new section "AGILE-PRO-S & MoA answers" — filled by lead (`filledBy: 'intern'`, hidden from client)

| id | label | type | required | closes gap |
|---|---|---|---|---|
| `agileGstinApply` | Apply for GSTIN through AGILE-PRO-S? | segmented yes / no | no (see Q1) | `agile.gstin` |
| `agilePoliceStation` | Police station (jurisdiction of the principal place of business) | text | no | `agile.esic` |
| `agileEsicOffice` | ESIC branch / inspection office | text | no | `agile.esic` |
| `agileSignatoryDirectorId` | Director who signs AGILE-PRO-S | select — options built at render from pre-15 (stores the pre-15 entry id, Q1 stable id) | no | `agile.authorizedSignatory` (mobile / email come from that director's pre-15 entry) |
| `agileDeclarationPlace` | Declaration place | text | no | `agile.declaration` |
| `agileDeclarationDate` | Declaration date | date | no | `agile.declaration` |
| `moaLiabilityClause` | MoA liability clause | select: `standard` ("The liability of the member(s) is limited, and this liability is limited to the amount unpaid, if any, on the shares held by them.") / `custom` | no | `moa.liabilityClause` |
| `moaLiabilityClauseText` | Liability clause text | textarea, `showWhen moaLiabilityClause = custom` | no | `moa.liabilityClause` |

Existing `spicePartBAndAgileFiledNotes` stays the only required pre-10 field.

### B. Client facts in existing client steps

| step / section | id | label | type | required | closes gap |
|---|---|---|---|---|---|
| pre-14 "Registered office" | `premisesPossession` | Nature of possession of the premises | select: Owned / Leased / Rented / Consent / Shared / Others (GST REG-01 list) | no (see Q1) | `agile.premises` |
| pre-14 | `premisesLeaseDocUrl` | Rent / lease agreement or consent letter | file, `showWhen` possession ≠ Owned (needs a `showWhen` not-equals, see Q4) | no | `agile.premises` |
| pre-1 "Business Description" | `primaryBusinessActivity` | Primary business activity (for GST) | select — GST "nature of business activity" list (see Q3) | no | `agile.businessActivity` |
| pre-1 "Business Description" | `preferredBank` | Preferred bank for the company account | text | no | `agile.bank` |

Not collected by this change (stay `missing`, "not collected"): `moa.objects`
(drafted on the portal from NIC + business description), HSN / SAC code,
`moa.witness.parentage`, `aoa.witness.dinPan`, the AGILE-PRO-S declarations.

## Files to change

| File | Change |
|---|---|
| `src/lib/checklist-responses.ts` | section A on pre-10; section B fields on pre-14 and pre-1 |
| `src/lib/part-a-sections.ts` | none expected — new pre-1 fields sit in the existing "Business Description" section |
| `src/views/incorporation/useMilestoneResponseFormState.tsx` | dynamic options for `agileSignatoryDirectorId` from pre-15 (same pattern as `getPre6DirectorNameOptions`) |
| `src/lib/checklist-pre10-validation.ts` | date sanity for `agileDeclarationDate`; signatory id must exist on pre-15 (warning, not error) |
| `src/lib/checklist-pre1-validation.ts` | none unless Q1 makes the new fields required |
| `src/lib/assist-profile/types.ts` | extend `AssistAgile` / `AssistMoa` with the new keys — **names must match Assist's `profile.sample.json` / `mapping.js`** (Q2) |
| `src/lib/assist-profile/build.ts` | read the new fields; remove the closed keys from `EFORM_GAPS`; blank → reason-less missing pointing at pre-10 / pre-14 / pre-1 with the right tab |
| `src/data/ask/field-help.ts` | draft help lines (`reviewed: false`) |
| `src/data/checklist.ts` | copy only: pre-10 `infoRequired` gains "AGILE-PRO-S and MoA answers"; pre-14 gains "Nature of possession"; pre-1 gains "Primary business activity, preferred bank" |
| `docs/specs/assist-profile/QUESTIONS.md` | record the Q2 checklist half as built |

Doc generators (`src/lib/incorporation-docs/*`) are not touched — none of these
answers is printed on a Suite-generated document today.

## Migration

None. Checklist responses are jsonb keyed by field id.

## Backward compatibility

- Every new field is optional, so no in-flight engagement is re-gated: a
  submitted pre-1 / pre-14 / pre-10 stays submitted, a step in progress can
  still be submitted without them.
- Client-side fields on a pre-1 / pre-14 the client already submitted can only be
  added if the step is reopened. Until then Assist lists them as reason-less
  missing items (fillable) instead of "not collected".
- Lead section is `filledBy: 'intern'`, so the client view and client redaction
  (`filterFieldsByViewer`, `checklistStateForViewer`) never show it.
- `leadWritablePatch` must keep accepting the new pre-10 ids (verify in tests).

## Tests

- `checklist-responses` / field-access: section A fields are hidden for the
  client variant; section B fields visible to the client.
- `checklist-pre10-validation.test.ts`: still passes with only the filing note;
  bad date flagged; unknown signatory id warns.
- `assist-profile/build.test.ts`: full fixture → no `agile.gstin / esic /
  authorizedSignatory / declaration / premises / businessActivity / bank /
  moa.liabilityClause` gaps; blank fixture → reason-less missing at the right
  step; signatory director's mobile / email taken from pre-15.
- Parity / doc hashes: unchanged (no generator reads these fields).

## Open questions for the owner

| # | Question | Default if no answer |
|---|---|---|
| 1 | Should any of these be **required** to submit (pre-10 lead fields, pre-14 possession, pre-1 activity / bank)? Required re-gates engagements that reopen a step | All optional; Assist shows blanks as fillable missing items |
| 2 | Assist profile **key names** for the new values (`agile.gstinApply`? `agile.policeStation`? …). Suite has no copy of `vcfo_assist` `profile.sample.json` / `mapping.js` here | Spec the keys after reading the Assist contract; do not invent them. Needs the Assist repo or the sample file |
| 3 | `primaryBusinessActivity` options: GST REG-01 "nature of business activity" list (Factory, Wholesale, Retail, Office / sale office, Supplier of services, …) — single or **multi**-select? Free text instead? | Single select from the GST list, plus "Others" |
| 4 | `premisesLeaseDocUrl` needs a "show when not Owned" rule; `showWhen` today is equals-only. Extend `showWhen` (type change in `checklist.ts`) or show the upload always, labelled "if not owned"? | Show always, optional, labelled "if not owned" — no type change |
| 5 | Is pre-10 the right home, given the lead fills it **before** SPICe+ filing but pre-10 submission means "filed"? Alternative: pre-7 (lead, earlier) | pre-10, as decided in Q2 |
| 6 | Bank preference: free text, or a select of the banks AGILE-PRO-S offers? | Free text |
