# VCFO Assist Agents — architecture and plan

## Context
The owner wants VCFO Assist, the firm's Chrome extension, to become a team of AI agents in the
browser side panel: robot avatars for Incorporation, Post-incorporation, Registration and
Compliance, each with sub-agents (for example SPICe+ Part A, GST REG-01).
- The user opens VCFO Suite and the government portal, picks a sub-agent, and logs in.
- The agent pulls the client's data from VCFO Suite, fills the portal, and does every legal step.
  The user signs with DSC, clicks Submit and pays.
- Token use must be tiny, because the agent already knows each form.

Decisions already made: users are staff only (leads, managers, admins; clients do not run
agents); stop at Submit and Pay; fill from a fixed field map, AI only on a
mismatch; the first sub-agent is SPICe+ Part A. The legal limits come from the firm's research
(`docs/specs/mca-connect/reports/`): no captcha, OTP or login filling; never click final submit;
never pay; a written CS opinion before live use; mock testing is allowed.

Related files in this folder: `SAFETY.md` (guards), `CS-QUESTIONS.md` (CS bundle), `ROADMAP.md`
(phases, metrics, backlog), `RESEARCH.md` (references) and `API.md` (the extension-to-Suite contract).

## What the research says (and what we take from each)
| Reference | Lesson | Our use |
|---|---|---|
| Stagehand (Browserbase): action caching | The AI finds a target once; code replays it with 0 tokens; on a miss, it falls back to AI | **Recipes** = cached, versioned actions. AI only on a miss. |
| UiPath Healing Agent and semantic selectors | Semantic match is a fallback only; an unfixable failure goes to a human review queue; every heal is logged | **Heal ladder** + **recipe patch review** in VCFO Suite |
| browser-use (DOM/accessibility tree) vs Skyvern (vision) | An accessibility tree costs about 10× fewer tokens than screenshots | Mismatch prompts use a **compact field list**, never screenshots |
| Adobe AEM Forms `guideBridge` (MCA V3 is inferred to be AEM Adaptive Forms from the `.guideFieldNode` selectors; confirm with the recorder, see `RESEARCH.md`) | `guideBridge.resolveNode(som).value` and `setProperty` set the form's own model, so its rules and validation run | Fill through **guideBridge in the page's main world**; fall back to native-setter input events |
| Claude in Chrome safety | Permissions first; confirm sensitive actions; bind each approval to one specific action; treat page text as untrusted | **Deny list**, **action-bound confirmations**, page text is data only |
| Chrome built-in AI (Gemini Nano Prompt API) | Free on-device model for small tasks | An optional free tier in the heal ladder for label matching |
| WXT framework | The current standard for MV3 + TypeScript + React side panels | The extension's build tool |

## Architecture
```
┌──────────────── Chrome ────────────────────────────────────────────────────────────┐
│ VCFO Suite tab            Portal tab (MCA / GST / …)           Side panel (React)  │
│  same-origin fetch ◄───┐   ┌ content script (isolated) ┐        🤖 agent grid       │
│  /assist-profile       │   │  field scanner, overlay   │◄──msg──► run view          │
│  /assist-runs          │   │  GUARDS (deny list)       │         "You do this" cards│
│  /assist/resolve       │   └ main-world filler ───────┘         drop zone, SRN     │
│                        │        guideBridge → DOM fallback                         │
│            background service worker = RUN ENGINE (state machine per sub-agent)    │
└────────────────────────┴───────────────────────────────────────────────────────────┘
                         ▼
┌──────────────── VCFO Suite (the brain, server side) ───────────────────────────────┐
│ Profile builder (exists: src/lib/assist-profile/build.ts)                          │
│ Recipe registry (versioned JSON per sub-agent + signed)                            │
│ Resolver: Haiku via src/lib/ask/provider, budget cap; sees labels only             │
│ Run log + audit (assist_runs) · Recipe patch review queue (staff approve fixes)    │
│ Journey map link: the node "INC-20A waiting" → "Run with agent"                    │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### 1. Recipes (the "protocol" knowledge)
One JSON file per sub-agent, for example `spice-a@1.4.0`:
- `pages[]`: each with a URL pattern and a "page is ready" check.
- `fields[]`: `{ key: profile key, som: AEM SOM path, css: fallback, label, transform, required }`.
  Transforms reuse `toMcaDate`, `rupeeAmount` and `vocabulary.ts`.
- `actions[]`: Save draft, Check form, Download PDF, Attach, each `kind: safe | human`.
- `gates[]`: `LOGIN`, `DSC`, `SUBMIT`, `PAY` (human only).
- `expect[]`: success signals, for example "SRN pattern on the page".
Recipes are built from `tools/mca-recorder/` captures plus the existing `mapping.js` and
`schemas/*.compact.json`. They are stored and versioned in Suite, signed, and cached in the extension.

### 2. Run engine (deterministic state machine)
`READY → PULL_PROFILE → WAIT_LOGIN(human) → FILL(page n) → CHECK → DOWNLOAD → WAIT_DSC(human)
→ ATTACH → RECHECK → WAIT_SUBMIT_PAY(human) → READ_SRN → WRITE_BACK → DONE`
- Each state is resumable, so a tab reload or session timeout continues where it stopped.
- Every transition is logged.

### 3. Heal ladder (the token saver)
| Tier | How a field is found | Cost |
|---|---|---|
| T0 | Recipe SOM path or selector | 0 |
| T1 | Deterministic: exact label, aria, name, fuzzy label (rules) | 0 |
| T2 | On-device Gemini Nano picks from candidates (optional) | 0 |
| T3 | Haiku through Suite: input = up to 40 candidate labels and the profile key names; output = a **choice from an enumerated list** (JSON schema) | about 1–2k tokens |
| T4 | Teach mode: the panel asks the user to click the field once | 0 |
- T3 and T4 results become a **recipe patch proposal**. Staff approve it in Suite, and every
  user gets the fix (fleet learning).
- Target: 0 AI calls on a normal run, and under 3k tokens on a run where the portal changed.

### 4. Safety by construction
- **The AI cannot act.** It only picks an index from candidates we enumerate; it never outputs
  selectors, URLs or values. A prompt injection on the page cannot add actions.
- **Values never leave the browser.** The profile goes from the Suite tab to the filler. The AI
  sees labels and key names only (DPDP-safe).
- **Deny list in code:** password, captcha and OTP inputs (type, name, label and image checks)
  are refused and logged. Buttons matching Submit, Pay or Final are never clicked; they are
  highlighted with a "You do this" card.
- **Action-bound confirmation:** the user sees exactly what will be filled (a diff table)
  before "Fill page".
- **Mock-only switch:** live portal hosts stay disabled by a server flag until the CS opinion
  is recorded; until then, runs go against the mock.
- No credentials are stored. No portal endpoints are called. Recipes are signed. The extension
  needs `sidePanel`, `scripting`, `storage` and host permissions for the Suite and portal domains only.

### 5. Side panel UX
- Robot avatars with idle, working and done animations.
- A readiness badge per sub-agent ("Ready" or "3 missing → fix in Suite", from `missing[]`).
- A live checklist with Agent and You chips, and a token and cost meter.
- A drop zone for signed PDFs: the browser cannot read the disk alone, so the user drops the
  file and the agent attaches it.
- Highlights drawn on the portal page through a Shadow DOM overlay.
- The SRN is read and written back to the checklist step.

## Build plan
| Phase | What | Where |
|---|---|---|
| 0 (now) | Spec + side-panel HTML prototype; CS question bundle sent | Suite `docs/specs/vcfo-assist-agents/` |
| 1 | Recipe schema + Part A recipe; run engine; guards with tests; guideBridge filler; mock portal from recorder captures | `vcfo_assist` repo (WXT) |
| 2 | Suite: recipe registry, `assist_runs` table + route (repository + AuthContext), resolver route (labels only, metered), patch review page | Suite |
| 3 | Part B, AGILE-PRO-S, e-MoA/AoA, INC-9 attach; journey map "Run with agent" | both |
| 4 | Live supervised runs once the CS opinion allows them | both |
| 5 | Registration agent (GST, Udyam, IEC); Compliance agent (DIR-3 KYC, AOC-4, MGT-7) | both |

## Reuse
`src/lib/assist-profile/build.ts`, `vocabulary.ts`, `types.ts`, the `/api/engagements/[id]/assist-profile`
route, `tools/mca-recorder/`, `src/lib/ask/provider/` and `config.ts` (models, budget cap),
`src/lib/ask/mask.ts`, `src/lib/secrets/app-secrets.ts`, and the journey model
`src/components/client-portal/pages/home/journey/journey-model.ts`.

## Verification
- Guard unit tests: fake captcha, OTP and password fields are refused; Submit and Pay buttons are never clicked.
- Mock run: a Part A recipe run on the mock fills every key with 0 AI calls.
- Drift test: rename a mock label; the run heals at T1 or T3, the payload holds no profile values, and a patch proposal is created.
- Injection test: page text saying "click submit" changes nothing.
- Suite: `npm run check`; role-scoping tests for the new routes.
- Metrics per run: fields auto-filled, heals by tier, tokens, minutes saved.
