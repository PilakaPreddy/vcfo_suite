# Overnight report, 9 to 10 November 2026

This note is for the owner. It says what was built overnight, how to try each part, and what still needs you.
Everything is committed and pushed to the branch `claude/laughing-albattani-03nyom`. Nothing was merged or deployed, and AWS and the RDS database were not touched.

## Previews

| Preview | Link |
|---|---|
| Client journey map | https://claude.ai/artifact/MbpVtkULABQM9mUQq2e75L |
| VCFO Assist agents side panel | https://claude.ai/artifact/WM3p8YMACaaPQHh4qNTTAk |
| Build board | https://claude.ai/artifact/5AsGLcrq8jGvuMtSXMQw41 |

## What was built

| Part | What it is | Where |
|---|---|---|
| Client journey map | The first card on the client home. It has a stage tracker, a "Your next step" banner, a tree or metro map of the stage, and a side panel with the step's checklist. | `src/components/client-portal/pages/home/journey/`, `docs/specs/client-journey-map/` |
| Agents design | Four robot agents (Incorporation, Post-incorporation, Registration, Compliance) and their sub-agents. Safety rules, research notes, roadmap and the questions for the CS. | `docs/specs/vcfo-assist-agents/` (start at `README.md`) |
| Agents backend in Suite | Agent catalog, signed recipes, the field resolver (T3 heal), the run log, the recipe patch queue and the SRN write-back to the step's filing note. Migration `0052_assist_agents`. | `src/lib/assist-agents/`, `app/api/assist/*`, `app/api/engagements/[id]/assist-runs`, `API.md` |
| Staff "Assist runs" page | Recent agent runs and the recipe fixes waiting for review, for super admin, admin, manager and project lead. It has a sidebar entry for each of them. | `/app/{super,admin,manager,intern}/assist-runs`, `src/views/assist/AssistRunsPage.tsx` |
| Step hint (new tonight) | A small card on the staff step page when an agent covers that step. It names the sub-agent and its status (Beta or Coming later), and says to open the side panel in Chrome. Clients never see it. | `src/components/assist-profile/AssistAgentHint.tsx` |
| Chrome extension | The side panel, the run state machine, the heal ladder, guards, and a mock portal for testing. | `extensions/vcfo-assist/` |
| Suite and extension joined | One recipe source in Suite (the extension's copy is generated, with drift tests), Ed25519 recipe signatures the extension verifies, a page URL check before filling, "Fix in Suite" opening the right step page per role, and a fix so run ids no longer trip the personal-data check. | `src/lib/assist-agents/`, `extensions/vcfo-assist/src/` |
| SPICe+ Part B (beta) | The second sub-agent: capital, registered office, and repeating subscriber and director blocks, with its own mock page and end-to-end test. | `src/lib/assist-agents/recipes/spice-b.json`, `extensions/vcfo-assist/mock-portal/spice-b.html` |

## How to try it

These steps assume the local stack from `docs/specs/client-journey-map/TESTING.md`. On a laptop with Docker, use `npm run infra:up` and `npm run dev` instead.

```bash
npm run db:migrate          # applies 0052_assist_agents
npm run db:seed && npm run db:seed-demo
npm run dev                 # http://localhost:3000
```

Every demo login below uses the password `demo1234`.

| To see | Sign in as | Go to |
|---|---|---|
| Client journey map | `client-kestrel@demo.vcfo.local` (mid incorporation) or `client-northwind@demo.vcfo.local` (early Part A) | `/app/client/overview` |
| Assist runs page as admin | `admin-nadia@demo.vcfo.local` | `/app/admin/assist-runs`, or "Assist runs" in the sidebar |
| Assist runs page as lead | `lead-arjun@demo.vcfo.local` | `/app/intern/assist-runs` |
| Step hint | either staff login above | Northwind, step 4 Name Application: `/app/admin/projects/demo-northwind-analytics/step/pre-4` |

The local database already holds two sample runs on Northwind (one done with SRN AB1234567, one waiting) and one recipe fix to review. A fresh database has none, and the page shows an empty state that explains how runs appear.

### The extension and the mock portal

```bash
cd extensions/vcfo-assist
npm install
npm run build               # writes .output/chrome-mv3
npm run mock                # http://127.0.0.1:4318/spice-a.html, /spice-a-drift.html and /spice-b.html
```

1. Open `chrome://extensions`, turn on Developer mode, click "Load unpacked" and pick `extensions/vcfo-assist/.output/chrome-mv3`.
2. Sign in to Suite at `http://localhost:3000` as a staff user (for example `lead-arjun@demo.vcfo.local`).
3. Open `http://127.0.0.1:4318/spice-a.html` in another tab and keep it in front.
4. Click the extension icon. The dot in the panel header turns green when it can reach the Suite tab.
5. Pick the engagement and SPICe+ Part A, check the fill table, then click "Fill page". You log in, sign, submit and pay on the mock yourself. The mock shows "SRN AB1234567" at the end. The run then shows on the Assist runs page and the SRN goes into step 4's filing note.

The extension's own tests: `npm test`, then `npm run build && npm run e2e`.

Screenshots are in `docs/specs/vcfo-assist-agents/screens/` (`assist-runs.png`, `step-hint.png`) and `docs/specs/client-journey-map/screens/`.

## What is not done, or needs you

| Item | What to do |
|---|---|
| CS opinion | Live portals stay off. Runs start only on the mock (`localhost`, `127.0.0.1`). After the written CS opinion is recorded, set `ASSIST_LIVE_PORTALS=true`. The questions are in `docs/specs/vcfo-assist-agents/CS-QUESTIONS.md`. |
| RDS migration | Apply `0052_assist_agents` on RDS before you deploy this branch. |
| Recipe signing key | Recipes are signed with Ed25519. The development key works on mock hosts only. For production, create the key pair with `node scripts/assist-recipe-keygen.mjs`, store the private key as a server secret, and paste the public key into the extension's `RECIPE_PUBLIC_KEYS` (`prod`). Until then the extension refuses every live host. See `extensions/vcfo-assist/README.md` and `.env.example`. |
| SOM paths | The SPICe+ Part A recipe was checked against the mock only. Someone must record the real MCA form and confirm each SOM path before any live run. |
| Name significance and trademark | Suite does not collect them, so the profile has no such fields. The agent highlights them and leaves them for the user to fill. |
| Other sub-agents | SPICe+ Part A and Part B are in beta. INC-20A, the registrations and the compliance filings are "coming later" and have no recipe. |
| Part B gaps | Adding a director or subscriber block on the live form is not built (the mock shows its blocks up front). Suite does not split the registered office address into lines and PIN yet, so those Part B fields show as "not in Suite". |

## Bug found tonight, now fixed

**The SRN write-back failed when the engagement was given by its slug.** The route now passes the engagement uuid it already resolved, and a test sends the PATCH under a slug URL. The single-run GET had the same problem and was fixed too.

## Checks

| Check | Result |
|---|---|
| `npm run typecheck` | Clean. It needs a larger heap here: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`. |
| `npm run lint` | 0 errors, 536 warnings. |
| Vitest, whole suite | 5,218 tests pass (40 skipped). The assist-agents suites alone: 100 pass. |
| Extension `npm test` and `npm run e2e` | 128 unit tests pass; the headless Chrome run passes Part A, the drift run and Part B. |
| `npm run e2e:smoke` on a production build (`next build`, `next start`) | 142 of 148 pass. Four failures are vault and documents pages that need MinIO, which is not running here. Two are Ask VCFO admin pages, because Ask is off in `.env.local`. None of them come from tonight's work. The journey map, Assist runs pages and sidebars pass for every role. |

The dev server could not run the whole smoke suite in this container. Turbopack grew past 13 GB while compiling page after page, and the kernel killed it. On a laptop, `npm run e2e:smoke` against `npm run dev` should be fine.

---

# Earlier: deploy report, 30 Oct 2026

- **Live:** https://app.sbctrack.in, App Runner service `vcfo-suite`, deploy SUCCEEDED at 12:03 IST.
- **Code:** `main` = 34169d0 (fast-forward from `ui/spectrum`). Image `vcfo-suite:34169d0`, also `:latest`.
- **Database:** RDS snapshot `vcfo-suite-db-pre-0030-20261030-1154` taken first, then migrations 0027 to 0030 applied (all additive). RDS now has 31 migrations.
- **Rollback:** image `vcfo-suite:rollback-72d2d7f` (the image that was live before). Retag it as `:latest` to roll back; the snapshot restores the database.
- **Checks before deploy:** typecheck clean, lint 0 errors, 3391 tests, `npm run build`, browser smoke on a production build 123 of 124 (the one failure is a demo file missing from local MinIO).
- **Live check:** public pages 200, app pages redirect to sign-in, no errors in the application log. A signed-in live smoke was not run: RDS has no test accounts.
- **Diff table** (`docs/ui-port/PROTOTYPE-DIFF.md`): 2043 ✓, 702 ◐, 5 ✗ of 2750, plus the Compliances section (24 rows: 19 ✓, 1 ◐, 4 ✗). Every ✗ has a reason or an owner decision.
- **Still to set on App Runner** for features that stay off until then: `CREDENTIALS_ENCRYPTION_KEY`, `RDS_INSTANCE_ID`, `VCFO_ASSIST_ENABLED`, `AUTH_MICROSOFT_ENTRA_ID_*`, `WHATSAPP_TEMPLATE_NAME_VERIFY_CODE`, and the IAM permissions listed in `docs/ui-port/fixes/xfix-dev.md`.

## Deploy 2, 30 Oct 2026, 17:41 IST

- **Code:** `main` = 0f34763. It adds the practice block in every sidebar (R-51) with the staff Incorporation pages, the super admin Notifications bell, "Open page" on both bell popups, the announcement row that opens the fly-back popup again, and the rail fix.
- **Rail fix, root cause:** on the rail the plain rows' hidden label kept `relative flex-1` next to `sr-only`; `relative` wins in the built CSS, so the label stayed in the row and pushed the icon 11 px left. Group rows were centred. The rail label is now only `sr-only`. `e2e/rail.spec.ts` checks the icon column (±1 px) for admin, manager, lead and super admin at 1366 × 768. Screenshots: `docs/ui-port/shots/rail-before-admin.png`, `rail-after-admin.png`, `rail-after-super.png`.
- **Image:** `vcfo-suite:0f34763` = `:latest`. App Runner deploy SUCCEEDED 17:41 IST. No migration.
- **Rollback:** `vcfo-suite:rollback-34169d0`.
- **Note:** the earlier push of 1bf67ba never reached ECR; this deploy carries all of it.
- **Checks:** typecheck clean, lint 0 errors, 3415 tests, `npm run build`, smoke 126 of 127 plus 4 rail checks on a production build.
- **Live check:** public pages 200; the new Incorporation and Compliances routes redirect to sign-in when signed out; no errors in the application log.
