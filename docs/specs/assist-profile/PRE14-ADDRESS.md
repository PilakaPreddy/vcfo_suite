# PRE14-ADDRESS — structured registered-office address on pre-14

Status: **draft, awaiting owner approval** (2026-10-06). No code written yet.
Decided by: `QUESTIONS.md` Q4 answer (2026-09-29).

## Goal

The client types the registered office the way MCA asks for it: line 1, line 2,
PIN code. The state stays a structured select (already built). The full address
becomes a **derived display value** built from those fields, so:

- Copy for Assist fills `registeredOffice.line1 / line2 / pincode / state` in
  `profile` and drops the "one line of text" missing item and the interim PIN note.
- `moa.ts` never needs the address-string state guess for a new engagement.
- Every existing reader of the full address keeps working unchanged.

## Fields (pre-14, section "Registered office", filled by client)

| id | label | type | required | notes |
|---|---|---|---|---|
| `registeredOfficeLine1` | Address line 1 (building, flat / floor) | text | yes | max 25 characters (MCA limit), checked in the validator |
| `registeredOfficeLine2` | Address line 2 (street, area) | text | no | max 25 characters |
| `registeredOfficeCity` | City / town | text | no | see open question 1 |
| `registeredOfficeState` | State / union territory | select | **yes** (was optional) | existing field, existing options; see open question 2 |
| `registeredOfficePincode` | PIN code | text | yes | six digits, first digit 1–9 (`/^[1-9]\d{5}$/`) |
| `registeredOfficeCompleteAddress` | Complete address | — | — | **no longer an input on pre-14.** Shown read-only, derived (below). Kept stored for legacy engagements |

NOC, utility-bill type / number / copy: unchanged.

Derived full address (one pure helper, `registeredOfficeDisplayAddress`):
`line1, line2, city, state label, PIN, India` — blanks skipped. Used only when
`registeredOfficeLine1` or `registeredOfficePincode` is present on pre-14;
otherwise the stored `registeredOfficeCompleteAddress` is the value, as today.

## Files to change

| File | Change |
|---|---|
| `src/lib/checklist-responses.ts` | pre-14: add the four fields above, drop the complete-address textarea from the rendered list (id stays readable), state `required: true` |
| `src/lib/registered-office-responses.ts` | new ids + `registeredOfficeDisplayAddress`; `resolveRegisteredOfficeResponses` returns the derived address under `registeredOfficeCompleteAddress` when pre-14 is structured — so `moa.ts`, `doc-pack/inputs.ts`, `proposed-directors.ts` and `build.ts` get it without their own change |
| `src/lib/checklist-part-b-validation.ts` | `validatePre14Responses`: 25-char limits, PIN format; required checks come from the field list |
| `src/lib/incorporation-docs/moa.ts` | `registeredOfficeStateFromAddress` used only when pre-14 has no structured fields (legacy). Clause II reads the select; `MOA_CLAUSE_2` reads the derived address. Missing-field copy says Pre-14, not Pre-6 |
| `src/lib/assist-profile/build.ts` | structured → `line1`, `line2`, `pincode`, `state` (+ `city` if collected) in `profile`; no `registeredOffice.lines` missing item, no interim PIN note. Legacy (no structured fields) → today's behaviour exactly |
| `src/views/incorporation/useMilestoneResponseFormState.tsx` | pre-14 seeding: project-setup / pre-6 address is no longer copied into an input; it is shown as "Address from project setup" reference text so the client can split it. State inference stays |
| `src/data/ask/field-help.ts` | draft help lines for the new ids (`reviewed: false`) |
| `src/data/checklist.ts` | pre-14 `infoRequired` copy only: "Registered office address — line 1, line 2, PIN code, state". No structural edit |

## Migration

None. Checklist responses are jsonb keyed by field id; new ids are additive.

## Backward compatibility

| Engagement state | Behaviour |
|---|---|
| pre-14 submitted / accepted with only the complete address | Unchanged. Readers fall back to the stored string; MOA keeps the legacy state guess; Assist keeps the missing item + interim PIN note. Not re-gated |
| pre-14 reopened (change requested) on such an engagement | Validator now asks for line 1, PIN, state. The old address is shown read-only above the fields as reference |
| Legacy pre-6 / pre-8 address only | Unchanged (resolve order pre-14 → pre-6 → pre-8 kept) |
| New engagement | Structured only |

## Tests

- `registered-office-responses.test.ts`: derived address join, blank skipping,
  structured wins over stored string, legacy fallback.
- `checklist-part-b-validation` (pre-14): 25-char limit on line 1 / line 2, PIN
  format (5 digits, leading 0, letters rejected), state now required.
- `moa.test.ts`: structured → clause II from the select, no guess; legacy unchanged.
- `assist-profile/build.test.ts`: structured → `line1 / line2 / pincode / state`
  in profile, no `registeredOffice.lines`, no pincode note; legacy fixture
  produces byte-identical output to today.
- Incorporation-docs parity hashes (being added on main): existing fixtures hold
  only the complete address, so their hashes **stay the same**. A new structured
  fixture gets its own hash. Any change to an existing hash is a bug, not a
  deliberate update.

## Open questions for the owner

| # | Question | Default if no answer |
|---|---|---|
| 1 | Collect **city / town**? MCA fills area / city / district from the PIN, but the MOA / letters print the full address and a 50-character line 1 + 2 often cannot hold the locality and city | Add `registeredOfficeCity`, optional |
| 2 | Make **state required** on pre-14 now that the client types a structured address? (Today it is a doc-pack blocker only) | Required for new submissions; legacy submitted steps untouched |
| 3 | 25-character limit: **hard error** or warning? | Hard error (MCA rejects longer lines) |
| 4 | On a reopened legacy pre-14, **pre-fill the PIN** from the trailing six digits of the old address (client confirms)? Q4 allowed the guess only in Assist `notes` | No pre-fill; old address shown as reference |
| 5 | Collect longitude / latitude here too (MCA asks; Assist lists them missing)? | No — out of scope |
