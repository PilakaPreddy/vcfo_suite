# VCFO Assist Agents — roadmap

This file breaks the build plan in `PLAN.md` into phases with exit criteria, defines the metrics
each run reports, and lists the sub-agents still to build with the portal each one works on. A
phase is done only when every exit criterion is met; the guards in `SAFETY.md` apply in every
phase.

## Phases

| Phase | Scope | Where | Exit criteria |
|---|---|---|---|
| 0 | Spec, side-panel HTML prototype, CS question bundle | Suite `docs/specs/vcfo-assist-agents/` | 1. `PLAN.md`, `SAFETY.md`, `ROADMAP.md`, `RESEARCH.md` and the API contract are in the folder. 2. The prototype shows the agent grid, the run view, a "You do this" card, the drop zone and the SRN step. 3. `CS-QUESTIONS.md` is sent, and the date sent is recorded here. |
| 1 | Recipe schema and the SPICe+ Part A recipe; run engine; guards with tests; guideBridge filler with DOM fallback; mock portal built from recorder captures | `vcfo_assist` repository (WXT) | 1. Every guard test in `SAFETY.md` passes in CI. 2. A Part A run on the mock fills every profile key with 0 AI calls. 3. The drift test heals at T1 or T3, sends no profile values and creates a patch proposal. 4. The injection test changes nothing. 5. The AEM inference is confirmed or corrected from a recorder capture (see `RESEARCH.md`). 6. Every state resumes after a tab reload. |
| 2 | Recipe registry (versioned, signed); `assist_runs` table and routes through a repository with `AuthContext`; resolver route (labels only, metered, budget cap); recipe patch review page | Suite | 1. `npm run check` passes. 2. Role-scoping tests pass for every new route: staff only, leads see only their engagements, clients get 403. 3. The resolver rejects a payload with any field beyond labels and key names, and stops at the budget cap. 4. A patch approved in the review page reaches a second browser on its next run. 5. The run metrics below appear on the run record. |
| 3 | SPICe+ Part B, AGILE-PRO-S, e-MoA (INC-33), e-AoA (INC-34), INC-9 attach; "Run with agent" from the journey map | Both | 1. Each form has a recipe and passes the mock run with 0 AI calls. 2. The signed-PDF attach test passes (bytes unchanged). 3. The journey map node (for example "INC-20A waiting") opens the right sub-agent with the engagement selected. 4. The readiness badge shows the same `missing[]` count as the Suite step. |
| 4 | Live supervised runs, once the CS opinion allows them | Both | 1. The written CS opinion is recorded in Suite with its scope and conditions. 2. Each condition is a guard, a test or a log field. 3. The live-portal switch lists only the hosts the opinion covers. 4. An agreed number of supervised filings (set from the opinion) finish with a reviewer sign-off, zero guard violations and zero account lockouts. 5. The SRN is written back for each one. |
| 5 | Registration agent (GST, Udyam, IEC); Compliance agent (DIR-3 KYC, AOC-4, MGT-7) | Both | Per sub-agent: 1. Recorder capture of the portal. 2. Mock and recipe. 3. Phase 1 tests pass on its mock. 4. The CS confirms the portal (question 19 in `CS-QUESTIONS.md`), and its host is added to the live switch. |

Phase 4 is blocked until the CS replies. Phases 1 to 3 do not depend on the reply, because they
run only against the mock.

## Run metrics

Every run reports these to `assist_runs`. The side panel shows the token and cost meter live; Suite
shows the rest per run and in total per sub-agent.

| Metric | Definition | Target |
|---|---|---|
| Fields auto-filled % | Fields the agent wrote ÷ recipe fields that have a profile value. Fields with no profile value count under `missing`, not as failures. | 100% on the mock; above 95% live |
| Heals by tier | Count of fields found at each tier: T0 recipe, T1 rules, T2 on-device model, T3 Haiku, T4 teach mode. | All T0 on a normal run. T3 and T4 together under 3 per changed page. |
| Tokens per run | Input and output tokens across all T3 calls, with the cost from `src/lib/ask/provider/pricing.ts`. | 0 on a normal run; under 3,000 on a run where the portal changed |
| Minutes saved | The measured manual time for the form (timed once per form from a real manual filing) minus the run's active time, excluding time spent at human gates. | Reported, no target until phase 4 data exists |
| Refusals | Guard refusals by guard number (G1 login, G2 captcha, G3 OTP, G4 submit, G5 pay, and so on), with the field label. | Expected at every gate; any refusal outside a gate is reviewed |
| Patch proposals | T3 and T4 results proposed as recipe patches, with the time until a staff member approves or rejects each. | Reviewed within two working days |
| Completion | Runs that reach `DONE` ÷ runs started, with the state where each other run stopped. | Reported per sub-agent |

## Sub-agent backlog

| Agent | Sub-agent | Portal host | Phase | Notes |
|---|---|---|---|---|
| Incorporation | SPICe+ Part A (name reservation) | MCA V3, `www.mca.gov.in` | 1 | The first sub-agent. |
| Incorporation | SPICe+ Part B | MCA V3, `www.mca.gov.in` | 3 | Must follow Part A within 20 days of name approval. |
| Incorporation | AGILE-PRO-S | MCA V3, `www.mca.gov.in` | 3 | Carries the linked GSTIN, EPFO, ESIC, bank and Professional Tax requests. |
| Incorporation | e-MoA (INC-33) | MCA V3, `www.mca.gov.in` | 3 | Web form on V3. |
| Incorporation | e-AoA (INC-34) | MCA V3, `www.mca.gov.in` | 3 | Web form on V3. |
| Incorporation | INC-9 attach, URC-1 | MCA V3, `www.mca.gov.in` | 3 | Attach only; the user drops each signed PDF. |
| Post-incorporation | INC-20A (commencement of business) | MCA V3, `www.mca.gov.in` | 3 | Linked from the journey map. |
| Post-incorporation | ADT-1 (first auditor) | MCA V3, `www.mca.gov.in` | 5 | |
| Registration | GST REG-01 | GST portal, `www.gst.gov.in` (registration pages under `reg.gst.gov.in`; confirm with the recorder) | 5 | The portal uses OTP and captcha; gates G2 and G3 apply. |
| Registration | Udyam registration | `udyamregistration.gov.in` | 5 | Aadhaar OTP is the user's step; Aadhaar data needs CS question 11 answered. |
| Registration | IEC | DGFT, `www.dgft.gov.in` | 5 | |
| Registration | Professional Tax, Shops and Establishments | State portals, one host per state (listed when a state is added) | 5 | Each state host is approved separately. |
| Compliance | DIR-3 KYC | MCA V3, `www.mca.gov.in` | 5 | |
| Compliance | AOC-4 | MCA V3, `www.mca.gov.in` | 5 | |
| Compliance | MGT-7 / MGT-7A | MCA V3, `www.mca.gov.in` | 5 | |

Each new host needs a recorder capture, a mock, a recipe and its own entry in the live-portal
switch (`SAFETY.md`, G11). Approval for one portal never extends to another.
