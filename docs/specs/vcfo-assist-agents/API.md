# VCFO Assist agents — Suite API

This is the server side the VCFO Assist extension calls for the agents in `PLAN.md`. Every route
lives in VCFO Suite and is called **from inside a signed-in Suite tab** (`chrome.scripting.executeScript`
running `fetch` in the Suite page), exactly like `/api/engagements/[id]/assist-profile`. The calls are
therefore same-origin and carry the Auth.js session cookie. There is no CORS header, no `OPTIONS`
handler, no bearer token and no extension origin list; see `docs/specs/assist-profile/06-no-cors.md`.
Do not call these routes from the extension's own origin.

## Common rules

- **Auth.** Staff only: super admin, admin, manager and project lead (`intern`). A client or a
  developer account gets `403`; no session gets `401`.
- **Scope.** Runs are reached through their engagement. A manager reaches engagements they manage,
  a lead the engagements they lead, admins every engagement. An engagement or run out of reach
  answers `404`, never `403`, so ids cannot be probed.
- **Labels only.** No request may carry a profile value. Only the free-text fields of a body are
  checked: the resolver's `fieldKey`, `fieldLabel` and candidate `label` / `name` / `aria`; the
  patch's `fieldKey`, `proposed` and `evidence`; the run update's `error`, heal `field` names and
  refusal `kind` / `target`. Anything there that looks like a PAN, Aadhaar, passport, DIN, email or
  phone number is refused with `personal_data` (`400` on the run and patch routes, `422` on the
  resolver). Ids (`runId`, `recipeId`), versions, enums and the SRN are never checked: a uuid whose
  first group is all digits looks like a DIN, so checking it would refuse a good request.
- **Responses.** JSON, `Cache-Control: private, no-store`. Success bodies have `ok: true`; errors
  are `{ ok: false, error: "<code>" }`. A malformed body is `400` with the first validation message
  as `error` (for example `srn_shape`, `personal_data`, or zod's own text).
- **Engagement ids.** `[id]` accepts the engagement uuid, a legacy app id or the project slug, the
  same as the assist-profile route.
- **Live portals.** Runs may start only on a mock portal host until the CS opinion is recorded and
  the server sets `ASSIST_LIVE_PORTALS=true`. Mock hosts come from `ASSIST_MOCK_HOSTS` (comma
  separated; `localhost` and `127.0.0.1` by default).

## Typical run

1. `GET /api/assist/catalog` — show the agent grid; note `liveEnabled` and `mockHosts`.
2. `GET /api/assist/recipes/spice-a` — verify `{ recipe, sig, alg, keyId }` against the extension's
   built-in public keys, then cache it by `recipe.version`.
3. `GET /api/engagements/[id]/assist-profile` — the values (existing route; they never leave the browser).
4. `POST /api/engagements/[id]/assist-runs` — start the run; keep `run.id`.
5. While filling: `PATCH .../assist-runs/[runId]` with progress. On a field miss the extension
   tries T0/T1/T2 itself, then `POST /api/assist/resolve` (T3) with `runId`, then teach mode (T4).
   A heal that found a better SOM path, selector or label is proposed with `POST /api/assist/patches`.
6. After the user submits and pays: `PATCH` with `status: "done"` and the `srn`.

"Fix in Suite" in the panel opens `GET /api/assist/step-link/[id]?step=<stepId>` in a new tab; Suite
redirects to that engagement's checklist step in the signed-in role's own shell.

---

## GET /api/assist/catalog

The agents and sub-agents for the side panel.

Response `200`:

```json
{
  "ok": true,
  "liveEnabled": false,
  "mockHosts": ["localhost", "127.0.0.1"],
  "agents": [
    {
      "id": "incorporation",
      "title": "Incorporation",
      "subAgents": [
        {
          "id": "spice-a",
          "agent": "incorporation",
          "title": "Name reservation",
          "form": "SPICe+ Part A",
          "status": "beta",
          "portal": "mca",
          "portalHost": "www.mca.gov.in",
          "recipeId": "spice-a",
          "recipeVersion": "1.1.0",
          "stepId": "pre-4",
          "srnField": "nameApplicationFilingNotes"
        }
      ]
    }
  ]
}
```

- Agents, in order: `incorporation` (spice-a, spice-b, agile-pro-s, emoa, eaoa, inc-9),
  `post-incorporation` (inc-20a, adt-1), `registration` (gst-reg-01, udyam, iec,
  shops-establishment, pt), `compliance` (dir-3-kyc, aoc-4, mgt-7).
- `status`: `beta` has a recipe checked against the mock (`spice-a` and `spice-b` today); `later`
  has none yet (`recipeId` and `recipeVersion` are `null`). Nothing is `ready` until a supervised
  live run.
- `stepId`: the checklist step the run advances (`pre-*`, `post-*`, `reg-*`); `null` for
  compliance sub-agents, which carry `activityId` (`ACT-M08`, `ACT-015-AOC4`, `ACT-015-MGT7`).
- `portalHost`: `null` for state portals (Shops and Establishments, PT).
- `srnField`: present when a finished run's SRN is appended to that step's filing note.
- Source: `src/lib/assist-agents/catalog.ts`.

## GET /api/assist/recipes/[id]

One recipe and its signature.

Response `200`: `{ "ok": true, "recipe": Recipe, "sig": "<base64, 64 bytes>", "alg": "ed25519", "keyId": "prod" | "dev" }`.
`404 not_found` for an unknown id; `500 server_error` when `ASSIST_RECIPE_PRIVATE_KEY` is set but is
not an Ed25519 PEM (an unsigned recipe is never served).

- `sig` is Ed25519 over the UTF-8 bytes of the recipe's **canonical JSON**: object keys sorted at
  every depth, no whitespace, `undefined` members dropped (`canonicalJson` in
  `src/lib/assist-agents/recipe.ts`; the extension has the same function).
- **Keys.** `ASSIST_RECIPE_PRIVATE_KEY` holds the private key as PKCS#8 PEM (one line with literal
  `\n` works too) and `ASSIST_RECIPE_KEY_ID` its id (default `prod`; `dev` is reserved).
  `node scripts/assist-recipe-keygen.mjs [keyId]` prints a new pair: the private key for Suite's
  env, and the public key (raw 32 bytes, base64url) for `RECIPE_PUBLIC_KEYS` in
  `extensions/vcfo-assist/src/engine/recipe.ts`. Without a private key, Suite signs with its built-in
  **dev** key (derived from a fixed seed in `signing.ts`, so it is effectively public) and says
  `keyId: "dev"`.
- **What the extension accepts.** It verifies with WebCrypto against its built-in key map
  `{ dev: <dev public key>, prod: null }`. `keyId: "dev"` is accepted on mock hosts only. A key id the
  map does not hold (including `prod` until the owner pastes its public key there), another `alg`,
  or a signature that does not verify is refused, and the run falls back to the bundled copy (mock
  hosts) or stops. A live portal therefore needs the production key on both sides.
- **One source.** `src/lib/assist-agents/recipes/*.json` is the only place a recipe is edited. The
  extension's `src/recipes/bundled.json` is generated from it, signed with the dev key, by
  `node --conditions=react-server --import tsx scripts/assist-recipes-bundle.ts`; tests on both sides
  fail when the two differ.
- Recipe shape (`recipeSchema`, strict; unknown keys are refused):

```ts
{
  id: string; version: 'x.y.z'; title: string; subAgent: string;
  verifiedAgainst: 'mock' | 'live';
  pages: {
    id; title;
    urlPattern: string;       // a glob on the portal path: `*` any run, `?` one character
    mockUrlPattern?: string;  // the same on a mock host, for example "/spice-a*.html"
    ready: Match;
  }[];
  fields: {
    key: string;            // Assist profile key, e.g. "company.proposedNames[0]" or "directors[{i}].din"
    page?: string;          // a pages[].id
    som: string;            // AEM SOM path for guideBridge.resolveNode
    css?: string;           // DOM fallback
    label: string;          // the portal label, for T1/T3 heals and the confirm table
    transform?: 'none' | 'toMcaDate' | 'rupeeAmount' | 'vocabulary' | 'nicDivision' | 'yesNo' | 'upper';
    required: boolean;
    askUser?: boolean;      // the profile cannot supply it: highlight, never type
    note?: string;
    each?: string;          // a repeating template over this profile array, e.g. "directors"
  }[];
  actions: { id; label; kind: 'safe' | 'human'; match: Match }[];  // Submit / Pay / Final / Sign are always 'human'
  gates: ('LOGIN' | 'DSC' | 'SUBMIT' | 'PAY')[];
  expect: { id; kind: 'srn' | 'text'; pattern: string /* JS RegExp source */ }[];
}
Match = { som?: string; css?: string; text?: string }   // at least one
```

- **Page check.** The extension plans and writes only while the portal tab's path matches the
  page's `urlPattern` (`mockUrlPattern` on a mock host). On another page the run waits with "Open the
  form page" and goes on by itself once the page is open.
- **Repeating groups.** A field with `each: "directors"` is a template: its key must read
  `directors[{i}].…` and its SOM path must hold `{i}` (0-based) or `{n}` (1-based); the CSS selector
  and label may use them too. After the profile is loaded, the extension writes one field per entry
  of that array (at most 20), so `directors[1].din` fills `…director[1].din[0]` and its label reads
  "Director 2: DIN". A placeholder on a field without `each` is refused. The template carries no
  count: the profile decides how many blocks are filled. The mock shows its blocks up front; adding
  an instance on a live form ("Add director") is not built.
- `spice-a@1.1.0` is `verifiedAgainst: "mock"`. Its SOM paths follow the mock convention
  `guide[0].guide1[0].guideRootPanel[0].<name>[0]` with these field names, which the mock portal
  must use: `proposedName1`, `proposedName2`, `significance`, `companyType`, `companyClass`,
  `companyCategory`, `companySubCategory`, `mainDivision`, `trademarkSimilar`
  (`MOCK_SPICE_A_FIELD_NAMES` in `src/lib/assist-agents/mock-fields.ts`). Its actions are Save,
  Check form, Download PDF and Attach PDF (`#signed-pdf`) as `safe`, Submit and Pay as `human`; its
  gates are `LOGIN`, `DSC`, `SUBMIT`, `PAY`. No `safe` label may contain "sign".
- `significance` (`company.nameSignificance`) and `trademarkSimilar` (`company.trademarkSimilar`)
  are `askUser: true`: Suite does not collect them yet, so the profile has no such keys.
- `spice-b@1.0.0` (SPICe+ Part B, `verifiedAgainst: "mock"`) fills `company.capital.*`, the
  `registeredOffice.*` keys, and `subscribers[{i}]` (name, father's first name, date of birth, PAN,
  email, mobile, shares) and `directors[{i}]` (name, DIN, PAN, date of birth, email, mobile) as
  repeating groups. Single fields use `MOCK_SPICE_B_FIELD_NAMES`; a group's fields sit at
  `<root>.<directors|subscribers>[0].<director|subscriber>[{i}].<name>[0]` with the mock control
  name `director{n}Din` and so on (`MOCK_SPICE_B_GROUPS`). The director designation is `askUser`
  (Suite does not hold it). The registered office lines and PIN code are in the recipe but the
  profile does not split the address yet, so they show as "not in Suite" until it does.

## POST /api/assist/resolve

The T3 heal: pick which candidate element is the field.

Body (strict):

```json
{
  "fieldKey": "company.proposedNames[0]",
  "fieldLabel": "Proposed name (1)",
  "recipeId": "spice-a",
  "runId": "uuid (optional)",
  "candidates": [{ "i": 0, "label": "Name 1", "name": "proposedName1", "aria": "optional" }]
}
```

- `candidates`: 1 to 40 items; `i` is the extension's own index (0–999); each text up to 200 chars.

Response `200`:

```json
{ "ok": true, "choice": 0, "confidence": 0.82, "tier": "T3", "tokens": 912, "aiCalls": 1 }
```

- `choice` is one of the `i` values sent, or `null` (none clearly matches). A model pick outside
  the list is discarded by the server.
- `tier: "T1"` means the server answered with its deterministic fuzzy label match instead of the
  model: no API key configured, the daily Ask token budget nearly spent, the path switched off
  (`ASK_KILL_PATHS=assist_resolve`), the run closed or out of model calls (10 per run), or the
  model reply was not valid JSON (then `aiCalls` is still 1).
- With `runId`, the call's tokens are added to that run's `aiCalls` / `aiTokens` on the server.
  The tokens also count in the Ask token report under "VCFO Assist field match".
- Errors: `422 personal_data`, `422 unknown_recipe`, `400` for a malformed body.
- The model sees only the field key, the field label and the candidates. It returns an index
  through a JSON schema; it never outputs a selector, URL or value.

## POST /api/engagements/[id]/assist-runs

Start a run. The server fills `agent`, `recipeId` and `recipeVersion` from its catalog.

Body (strict):

```json
{ "subAgent": "spice-a", "portalHost": "localhost:3100", "recipeVersion": "1.0.0", "fieldsTotal": 9, "state": "READY" }
```

- `portalHost`: the host of the portal tab (a port is ignored). Required.
- `recipeVersion`: optional; send the cached version to detect a stale cache.
- `fieldsTotal`: optional, defaults to the recipe's field count (a repeating template counts once,
  so the extension sends the expanded count). `state`: optional, `READY` by default
  (upper case, `^[A-Z][A-Z0-9_]*$`).

Response `201`: `{ "ok": true, "run": Run }`.

Errors: `400 unknown_sub_agent`, `400 no_recipe` (a `later` sub-agent),
`409 recipe_outdated` (with `recipeVersion` = the current version: refetch the recipe),
`403 live_portals_disabled`, `404 not_found` (engagement out of reach).

## GET /api/engagements/[id]/assist-runs

This engagement's runs, newest first (up to 50). Response `200`: `{ "ok": true, "runs": Run[] }`;
`404 not_found` when the engagement is out of reach.

## GET /api/engagements/[id]/assist-runs/[runId]

One run, to resume after a tab reload. `200 { ok, run }`; `404 not_found` when the run is out of
reach or belongs to another engagement.

## PATCH /api/engagements/[id]/assist-runs/[runId]

Progress, the SRN and the finish. Send only what changed.

Body (strict; every member optional):

```json
{
  "status": "running | waiting_user | done | failed | cancelled",
  "state": "FILL",
  "fieldsTotal": 9,
  "fieldsFilled": 7,
  "heals": [{ "field": "company.type", "tier": "T1", "ok": true }],
  "refusals": [{ "kind": "captcha", "target": "Enter captcha", "at": "2026-11-09T10:00:00Z" }],
  "srn": "AA1234567",
  "error": "short reason, no values"
}
```

- `heals` (up to 200, tiers `T0`–`T4`) and `refusals` (up to 100) **replace** the stored arrays:
  send the run's full list each time.
- `srn`: 6–20 letters and digits, upper-cased by the server.
- `aiCalls` and `aiTokens` cannot be sent; only the resolver writes them.
- `done`, `failed` and `cancelled` close the run and stamp `finishedAt`. A closed run answers
  `409 run_closed` to any further PATCH.
- Only the person who started the run, or an admin or manager in scope, may change it
  (`403 forbidden` for another lead).

Response `200`:

```json
{ "ok": true, "run": Run, "srnWriteBack": { "recorded": true, "stepId": "pre-4", "field": "nameApplicationFilingNotes" } }
```

- `srnWriteBack` appears only when this PATCH finished the run as `done` with an SRN on it. Where
  the catalog names an `srnField` (spice-a → pre-4, spice-b → pre-10, inc-20a → post-6), the line
  `SRN <srn> (VCFO Assist, YYYY-MM-DD)` is appended to that filing note through the ordinary
  checklist save (same role rules, audited, no status or review change, no email). Otherwise
  `{ "recorded": false, "reason": "no_step_field" }` and the SRN stays on the run.
  `reason: "checklist_refused"` means the step would not take the save (for example it is locked);
  the run is still `done` with its SRN.
- The write-back reads and saves the checklist by the engagement uuid the route resolved, so a
  run URL that names the engagement by its slug records the SRN too.

### Run

```ts
{
  id: string; engagementId: string; companyName: string | null;
  userId: string; userName: string | null;
  agent: string; subAgent: string; recipeId: string; recipeVersion: string;
  status: 'running' | 'waiting_user' | 'done' | 'failed' | 'cancelled';
  state: string; fieldsTotal: number; fieldsFilled: number;
  heals: { field: string; tier: 'T0'|'T1'|'T2'|'T3'|'T4'; ok: boolean }[];
  refusals: { kind: string; target?: string; at?: string }[];
  aiCalls: number; aiTokens: number; srn: string | null; error: string | null;
  startedAt: string; finishedAt: string | null; updatedAt: string;   // ISO
}
```

## GET /api/assist/step-link/[id]?step=<stepId>

"Fix in Suite". A `302` to the engagement's checklist step page in the shell the signed-in role can
open, so the extension does not need to know the role:

| Role | Lands on |
|---|---|
| Project lead (`intern`) | `/app/intern/engagements/{slug}/step/{stepSlug}` |
| Manager | `/app/manager/projects/{slug}/step/{stepSlug}` |
| Admin, super admin | `/app/admin/projects/{slug}/step/{stepSlug}` |

- `[id]` is the uuid, legacy id or slug. Without `step`, or with a step id the checklist does not
  know, it lands on the engagement page instead.
- Signed out goes to `/login`; a client or developer to their home; an engagement out of reach to
  the caller's role home (never a `404` page, so ids cannot be probed).
- The extension sends the step of the first `missing[]` entry that names one, else the sub-agent's
  catalog `stepId`. Source: `src/lib/assist-agents/step-link.ts`.

## GET /api/assist/agent-runs

The staff page's list: recent runs on every engagement in the caller's scope, newest first.
Query `limit` (1–200, default 50). `200 { ok, runs: Run[] }`.

## GET /api/assist/patches

The recipe patch queue. Query `status` (`proposed` | `approved` | `rejected`; all when absent) and
`recipeId`. Super admin, admin and manager see every patch; a lead sees only the patches they
proposed. `200 { ok, patches: Patch[] }` (up to 100, newest first).

## POST /api/assist/patches

Propose a recipe fix found by a heal.

Body (strict):

```json
{
  "recipeId": "spice-a",
  "recipeVersion": "1.0.0",
  "fieldKey": "company.type",
  "proposed": { "som": "guide[0]...companyType[0]", "css": "[name=companyType]", "label": "Type of Company" },
  "evidence": { "fieldLabel": "Type of company", "candidateLabels": ["..."], "chosenLabel": "Type of Company", "confidence": 0.9, "note": "label reworded" },
  "sourceTier": "T1 | T3 | T4",
  "runId": "uuid (optional)"
}
```

- `proposed` needs at least one of `som`, `css`, `label`. `evidence` is labels only (up to 40
  candidate labels).
- `fieldKey` is the concrete key; a repeating field is proposed as `directors[1].din`, which
  names the recipe's `directors[{i}].din` template.
- Errors: `400 unknown_recipe`, `400 unknown_field` (the key is not in the recipe),
  `400 personal_data`, `404 not_found` (the run is out of reach).

Response `201`: `{ "ok": true, "patch": Patch }`.

## POST /api/assist/patches/[id]/review

Approve or reject a proposed patch. Super admin, admin and manager only (`403` for a lead).

Body: `{ "decision": "approved" | "rejected" }`.

Response `200`: `{ "ok": true, "patch": Patch }`. Errors: `404 not_found`, `409 already_decided`.
The decision is audited (`assist.patch_approved` / `assist.patch_rejected`). Approving does **not**
change the served recipe: a person applies the fix to the recipe JSON and bumps its version, so
every extension refetches it (`recipe_outdated` on the next run start).

### Patch

```ts
{
  id: string; recipeId: string; recipeVersion: string; fieldKey: string;
  proposed: { som?: string; css?: string; label?: string };
  evidence: { fieldLabel?: string; candidateLabels?: string[]; chosenLabel?: string; confidence?: number; note?: string };
  sourceTier: 'T1' | 'T3' | 'T4'; runId: string | null; proposedBy: string | null;
  status: 'proposed' | 'approved' | 'rejected'; reviewedBy: string | null; reviewedAt: string | null; createdAt: string;
}
```

## Not to be confused with

`/api/assist/runs`, `/api/assist/engagements/[id]/runs` and `/api/assist/engagements/[id]/result`
serve the older `assist_runs` table (migration 0029): the "Start filing" state per compliance
filing period or registration, which the client portal also shows. The agent run log here is a
separate table, `assist_agent_runs` (migration `0052_assist_agents`), and is staff-only.

## Where the code lives

| Part | Path |
|---|---|
| Recipe schema, canonical JSON | `src/lib/assist-agents/recipe.ts` |
| Recipes | `src/lib/assist-agents/recipes/*.json`, `registry.ts` |
| Mock field names | `src/lib/assist-agents/mock-fields.ts` |
| Catalog, live-host gate | `src/lib/assist-agents/catalog.ts` |
| Signing (Ed25519), key pair | `src/lib/assist-agents/signing.ts`, `scripts/assist-recipe-keygen.mjs` |
| Extension bundle generator | `scripts/assist-recipes-bundle.ts` → `extensions/vcfo-assist/src/recipes/bundled.json` |
| Fix in Suite redirect | `app/api/assist/step-link/[id]/route.ts`, `src/lib/assist-agents/step-link.ts` |
| Resolver | `src/lib/assist-agents/resolve.ts`, `pii.ts` |
| Request bodies | `src/lib/assist-agents/api-schemas.ts` |
| SRN write-back | `src/lib/assist-agents/record-srn.ts` |
| Repositories | `src/db/repositories/assist-agent-runs.ts`, `assist-patches.ts` |
| Tables | `src/db/schema-assist.ts`, `src/db/migrations/0052_assist_agents.sql` |
| Staff page | `src/views/assist/AssistRunsPage.tsx`, `/app/{super,admin,manager,intern}/assist-runs` |
