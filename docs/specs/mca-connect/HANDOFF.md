# Handoff: VCFO Assist and SPICe+ filing on the MCA portal

Written on 5 November 2026 so that another chat or Claude account can continue this work. State was checked on that date. Check it again before you act, because other sessions use this checkout.

## Read these first

| File | Why |
|---|---|
| `docs/specs/mca-connect/PLAN.md` | The full plan v3: routes, 81 questions, procedure, and unsent drafts (Appendix A to the CS, B to MCA, C to vendors). The original is `~/.claude/plans/plan-connect-mca-moonlit-matsumoto.md`. |
| `docs/context/notes/assist-filing.md` | The Suite API contract for the filing record, and what the signature check does not do. |
| `../vcfo_assist/CLAUDE.md`, `QUESTIONS.md` (Q45, Q46), `docs/STATUS.md`, `docs/unbound-spice-part-b.md` | The extension's rules, decisions and status. |
| `docs/specs/mca-connect/VCFO-Assist-Summary.pdf` | Two-page summary for an outside reader. It states the September capture facts. |
| `docs/specs/mca-connect/MCA-Market-Report.pdf` | How vendors connect to MCA. It omits the September capture on purpose. |

The earlier transcript is `~/.claude/projects/-home-farhath-Documents-vcfo-suite/ee9c14a0-86e7-4ef0-ac46-a7b74c47fb7e.jsonl` (11 MB). Search it only if you need exact detail.

## The problem and the goal

SBC staff type each new company's data twice: in VCFO Suite and on the MCA V3 portal. The owner wants Suite data to fill SPICe+ Part A and Part B on the portal, and to file if that is possible. The owner also wants to know how ComplyRelax and other vendors do this.

## Owner rules

The memory of the first account is not visible from another account, so these rules are copied here.

1. **"Nothing should be illegal."** This overrides everything. A written CS or counsel opinion decides. If the opinion is unclear, treat the method as prohibited. See plan section 1.1.
2. **Do not touch the live MCA portal.** No live test, including from test scripts, before written CS approval. `tools/e2e-offline.mjs` disables name lookups for this reason.
3. **Prohibited:** captcha or OTP bypass, signing for a signer, using another person's login or DSC without valid authority, false or test data on the portal, calls to private portal endpoints.
4. **No commit, deploy, RDS migration or message to anyone** unless the owner says go for that item. The "never ask for approvals" instruction applied to the 5 November build only.
5. Plans are wanted in tabular ASD-STE100 style. Docs and comments use plain full sentences. End each reply with the absolute path of the file to open.

## What the research found

- We found no public MCA filing API.
- Gen CompLaw shows SPICe+ Part A and Part B from desktop software that holds MCA IDs. ComplyRelax uses a cloud app plus a Windows agent and stored logins. Leagully acts from the cloud with stored logins, and a person gives the OTP. CSTrax and AutoROC only prepare data. We tested no vendor and found no MCA approval for any of them.
- V3 portal order: login with captcha and OTP, web form submit, PDF and SRN, DSC signing on the PDF, upload within 15 days of the SRN, payment within 7 days of upload.
- 54 of 64 captured `/bin` posts carry opaque, apparently encrypted data. Private endpoints are rejected (route R6).

## The chosen route

Route R1: a Chrome extension (`vcfo_assist`) fills forms inside the person's own logged-in session and stores no credentials. A person logs in, submits, signs and pays. Suite holds the filing record and checks the PDFs.

**The plan's decision gate was skipped at the owner's request.** The plan puts the CS opinion, timed filings and vendor demos before a build. The owner asked to build Track 3 first. Those checks are still open, and the time saved is unmeasured.

**api-anything (github.com/goodnight000/api-anything) was examined and rejected.** It replays private site requests, which rule 3 prohibits. Its docs say it does not solve captchas, its last-resort browser tier is reads only, and its writes are tested only against a local fixture. Its issues #108 to #112 report plaintext cookie storage and reading the everyday browser's cookies, so do not install it on a machine with MCA or client sessions. Only its docs and issues were read. It was not run.

## What is built (all uncommitted)

**`/home/farhath/Documents/vcfo_assist`**, branch `main`, version 0.2.0:

- Part B is enabled, and a saved CS approval reference is required before a run starts.
- Form-change check (`src/engine/drift.js`, `ops/driftCheck.js`, `schemas-full/*.known.json`).
- File attach (`ops/upload.js`), run sync to Suite (`src/suite/runsync.js`), person-typed SRN, attach of the signed PDF.
- Fragile fields are skipped and listed for the person. Rerun leaves held values alone.
- Credential guard fix: `otp(?!anel)`. The old pattern matched `rootPanel` and would have refused every field on the live form.
- Recipes regenerated (v3). Recipes contain no submit, sign or pay step, and a test enforces this.

**`/home/farhath/Documents/vcfo-suite`**, branch `main` at `c7ae16b6`:

- `src/lib/mca-filing/`, `src/db/repositories/assist-filings.ts`, `assist-attachments.ts`, routes under `app/api/assist/engagements/[id]/` (`attachments/`, `filing/`), `src/components/incorporation/McaFilingCard.tsx`, `src/hooks/use-mca-filing.ts`, `src/jobs/assist-filing-deadlines.ts`, migration `0041_assist_filings`.
- Edits to the schema, journal, `compliance-subject-scope.ts`, Inngest route, jobs registry, `next.config.mjs`, `package.json` and lock (`pdfjs-dist`), `.env.example`, `EngagementDetail.tsx`, `STATE.md`, the READMEs.
- The run label changed from "Filed by Assist" to "Reference recorded".

## Test results

| Check | Result on 5 November |
|---|---|
| Extension | `npm run check` clean, `npm test` 13 pass, `npm run e2e:offline` all pass |
| Suite | A subagent reported 4,410 tests in 451 files passing and a `next dev` check. I then reran only the related tests (117 and 16) and the type check after a label change. |
| Live portal | Not run. The offline browser run removes page scripts and uses a stand-in Suite. |

## Things to fix or watch

1. **The migration number is out of date.** `ui/prototype-match` now has migrations up to `0045`, including its own `0041_receivables_send_status`. To land this work there: delete `src/db/migrations/0041_assist_filings.sql` and `meta/0041_snapshot.json`, remove its journal entry, then run `npm run db:generate -- --name assist_filings`. That should now give 0046. Local Postgres was at 0040. Apply on RDS before any deploy, and set `VCFO_ASSIST_ENABLED`.
2. **The work is exposed.** It sits uncommitted in a shared checkout, and another session moved this checkout between branches. Commit `81012c40` on `ui/prototype-match` took these files back out after they landed there by accident. Commit to a dedicated branch as soon as the owner says go.
3. **Review the extension's diff before committing.** `capture/drive*.sh`, `tools/test_filler.js`, the `START-HERE.md` and `consolidation/BRIEF.md` renames and `docs/context/` are not on my list of this build's changes, so they may be older or from another session.
4. **Disclosure.** The first three e2e runs, before the name-lookup block, may have loaded the public MCA site with no login, data or filling. This was not established either way.
5. **September 2026 capture.** Scripts opened MCA forms in a logged-in session, and the log records two clicks on a control named Submit. Who clicked and what was filed is not established. `reference/vcfo_assist/mca-capture/profile` holds browser `Cookies` and `Login Data` files, and the folder is group-writable. Those files were not opened. Do not open them, and do not delete the folder before the CS answers B12.

## Departures from the plan, and known limits

- Added: the CS approval gate. Not in the plan's steps, and it checks only that a reference was saved.
- No new Part B bindings, since the plan allows them only after a test. 610 of 1,110 fields are bound. The other 500 are sorted into proposed groups (system 146, portal 62, conditional 59, review 233). 50 fragile row fields stay with a person.
- Fields that are absent or refused by the credential guard are listed, and the run continues. Ambiguity still stops the run.
- A person uploads the portal PDF on the Suite card, and types the SRN. The extension fetches neither.
- Part B has no auto-save for each section. Recovery is rerun and refill.
- MOA and AOA are not attached, because Suite holds only unsigned Word drafts.
- The signature check does not verify the chain to the CCA root, so a self-made certificate passes. `text_differs_from_portal_pdf` may refuse a PDF that a signing tool re-saves. Real MCA PDFs and DSC tools are untried.
- Signer emails and the deadline job have not run live.
- The card is on the engagement page only, and any staff member in scope, including a lead, can approve the review.
- The build was not strictly sequential: an agent built the Suite work in parallel.

## Next steps

| Order | Action | Who |
|---|---|---|
| 1 | Restrict the capture folder. Send Appendix A to the CS with the capture facts. | Owner |
| 2 | Decide the branch, then commit both repositories. | Owner says go |
| 3 | Time three filings as a baseline. Book vendor demos (Appendix C) with no real login. | Owner, lead |
| 4 | After CS review, send Appendix B to MCA. | Owner |
| 5 | After written approval, run Part A on one real planned filing with true data. Stop before submit. | Developer, lead |
| 6 | Capture Part B with filled repeat rows. Confirm new bindings. | Developer |
| 7 | File three real companies with a CS watching, then release. | CS, lead |

Steps 5 to 7 cannot start without a person's login and the CS opinion.
