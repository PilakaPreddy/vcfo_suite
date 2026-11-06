# Ask VCFO — status

What the two specs asked for (`ASK-VCFO-CONTEXT.md` v2.0 and
`ASK-VCFO-GAPS-CONTEXT.md` v1.0) against what is in the code. **Built** = as
specified. **Changed** = built differently, with the reason. **Omitted** = not
built, with the reason. Last updated 2026-09-30.

Verification: `npx tsc --noEmit` 0 errors · vitest 163 files, 1,491 tests ·
`tests/ask` mock evals 70 · live eval 29 of 29 (`EVAL-LIVE-2026-09-30.md`) ·
Playwright `e2e/ask-vcfo*.spec.ts` 19 tests.

## Spec items

| Spec item | Status | Where | Reason (Changed / Omitted) |
|---|---|---|---|
| §0.2 Roles: client, admin, super admin only; manager and Project Lead get 403 | Built | `src/lib/ask/access.ts`, `src/lib/ask/route-guard.ts`, `src/components/ask/AskShellMount.tsx` | |
| §3 Topic, visual, envelope, suggestion and glossary schemas | Built | `src/data/ask/schema.ts` | |
| §3.4 Starter topics | Built | `src/data/ask/topics/*.json` (25, all `draft`) | Drafts until a named reviewer publishes (GAP-2) |
| §3.2 Draft topics never badged "Reviewed" | Changed | `src/lib/ask/topics.ts` `topicToAnswer` | The spec serves only published topics directly. Drafts are served without a model call but badged "Not yet reviewed", so suggestions work before review |
| §3.5 Suggestions per shell | Built | `src/data/ask/suggestions.ts`, `src/lib/ask/suggestions.ts` | |
| §4.1–4.2 Conversations and messages tables | Built | `ask_conversations`, `ask_messages` (migrations 0021, 0022) | Created as `assist_*` under the working name, renamed in 0022 |
| §4.3 Client library table | Built | `client_library_items`, `src/db/repositories/client-library.ts` | |
| §4.4 Knowledge sources and chunks | Changed | `ask_documents`, `ask_chunks` | Hybrid search with Titan V2 vectors at 512 dimensions; provider `none` runs on full text (`docs/specs/ask-vcfo/BUILD-PLAN.md`, phase 2) |
| §4.5 "Ask my lead" reuses existing requests | Changed | `src/db/repositories/ask-handoff.ts` | Clients cannot create `document_requests`, and the client change request reopens a step. Owner chose a `tasks` row for the lead plus a notification |
| §5 API routes | Built | `app/api/ask/*` | Also `status`, `nudge`, `brief`, `admin/gaps` for later features |
| §6.1 Provider interface, Anthropic and Bedrock | Built | `src/lib/ask/provider/*` | |
| §6.2 Guard | Built | `src/lib/ask/guard.ts` | |
| §6.3 Project snapshot, forbidden fields | Built | `src/lib/ask/snapshot-build.ts` | |
| §6.4 Read-only tools | Built | `src/lib/ask/tools/*` | |
| §6.5 `render_answer` with forced tool choice | Changed | `src/lib/ask/generate.ts` | The answer model rejects forced tool use. `tool_choice: auto`, a prompt instruction, and a text-only fallback |
| §6.6 Validation: schema, citations, dates, steps, visuals | Built | `src/lib/ask/validate.ts` | |
| §6.6 (5) No content from a non-finalised board resolution | Changed | `src/lib/ask/tools/client.ts` | Stronger than asked: Ask VCFO tools never read board resolutions at all |
| §6.7 Rate limit from `ask_messages` | Built | `src/lib/ask/rate-limit.ts` | |
| §6.8 Fixed refusal copy | Built | `src/lib/ask/refusals.ts` | |
| §7.1–7.6 Panel, launcher, thread, answer card, visuals, a11y | Built | `src/components/ask/*` | |
| §7.2 Top bar order | Changed | `src/components/shell/TopBar.tsx` | Launcher sits after search; the existing bells, theme and profile order was left as it is |
| §7.7 Go-there links, scope check, arrival focus, back pill | Built | `src/lib/ask/destinations.ts`, `resolve-href.ts`, `src/hooks/ask/useAskFocus.ts`, `AskLinkButton`, `BackToAskPill` | |
| §7.7 `{ to: "inbox" }` | Changed | `src/lib/ask/resolve-href.ts` | There is no client Inbox; it resolves to client Home |
| §7.7 Pulse uses `.journey-node-pulse` | Changed | `app/globals.css` `.ask-focus-pulse` | `.journey-node-pulse` loops forever and marks the current step; a one-shot pulse is used |
| §8.1 "What's this?" | Built | `src/components/ask/WhatsThisButton.tsx` | Placed on Home next action, journey rail, step title, phase rows, form sections, glossary fields and compliance rows (no Inbox exists) |
| §8.2 Glossary terms | Changed | `src/components/ask/GlossaryTerm.tsx` | Underlined on the next-action card and filing names only. Rail labels, phase rows and calendar names sit inside links or buttons, and step descriptions are not rendered anywhere |
| §8.3–8.4 Library and reader | Built | `src/views/client/ask/*`, `src/components/ask/AskReader.tsx` | `shared_with_team` column exists; the toggle is later, as specified |
| §8.5 PDF brief | Built | `src/lib/ask/pdf-brief*.ts(x)` | New dependency `@react-pdf/renderer`, approved by the owner |
| §9 Staff query answers, draft reminder, preview as client | Built | `src/lib/ask/suggestions.ts`, `AskPreviewPicker`, `src/views/staff/ComposeMail.tsx` | Super admin's reminder opens the firm admin compose page (super has none) |
| §9A C1 Daily nudge | Built | `src/lib/ask/nudge.ts`, `ask_client_prefs` (migration 0023) | Flag `ASK_VCFO_FEATURE_C1`, off |
| §9A C2 Explain this document | Built | `src/data/ask/documents.ts` | Flag C2, off |
| §9A C3 Why do we ask this | Built | `src/data/ask/field-help.ts`, `FieldHelpButton` | Flag C3, off. Lines show only once reviewed |
| §9A C4 Monthly status brief | Built | `src/lib/ask/status-brief.ts`, `/api/ask/brief` | Flag C4, off |
| §9A C5 What if I miss it | Built | `src/data/ask/topics/obligation-*.json` | Flag C5, off. Only published obligation topics are served; drafts carry no amounts |
| §9A A1 Question gaps and visibility notice | Built | `/app/admin/ask-vcfo/gaps`, `src/db/repositories/ask-question-gaps.ts` | Flag A1, off. Notice wording is the owner's to confirm |
| Phase 7 Knowledge ingestion | Changed | `src/lib/ask/ingest/*`, `src/jobs/ask-ingest.ts` | PDF text is read locally with unpdf and only scanned pages go to a model. Ingestion runs in-process when Inngest is unreachable |
| Phase 8 Evals | Built | `tests/ask/evals/*` | |
| §13 Reranker, thumbs, library sharing, retention job, learning path | Omitted | — | Listed by the spec as later backlog |
| GAP-1 Phase progress tool and where-now answer | Built | `src/lib/ask/phase-progress.ts` | |
| GAP-1 §2.3 Step 3 of the e2e flow expects "Not yet reviewed" on the where-now answer | Changed | `e2e/ask-vcfo.spec.ts` | The where-now answer is `deterministic` per §2.3, so it carries the firm badge. "Not yet reviewed" is asserted on a topic answer instead |
| GAP-1 §2.4 Free-text shortcut for "where are we?" | Omitted | — | `shortcut.ts` is the keyboard shortcut, not a pipeline shortcut; the model answers with `getPhaseProgress` as the spec allows |
| GAP-2 Review pack and publish command | Built | `scripts/ask-topics-report.ts`, `scripts/ask-topics-publish.ts`, `TOPIC-REVIEW.md` | |
| GAP-3 Live evaluation | Built | `tests/ask/evals/run-live.ts`, `EVAL-LIVE-2026-09-30.md` | 29 of 29 on the first round; no prompt changes |
| GAP-4 Browser tests and screenshots | Built | `e2e/ask-vcfo.spec.ts`, `e2e/ask-vcfo-screens.spec.ts` | Demo users are the `db:seed-demo` set; the `@vcfo.local` users the spec names are not in the local database |
| GAP-5 Documentation | Built | this file, `PHASE-0-RECON.md`, `docs/context/STATE.md` | |

## Known limits

- Phase names are "SPICe+ Part A / Part B" for every legal form, including an
  LLP, because the checklist catalog and its phases do not vary by form. Not
  changed without the owner.
- Fixed: "What is my next step?" now labels its link from the step's client form
  fields (same check as the where-now answer), so an upload step says "Upload
  documents now".
- Without a model key, a free-text question gets "Ask VCFO is unavailable right
  now" rather than a refusal, because the guard is the model.
- `public/llms.txt` still describes an unrelated product; it predates Ask VCFO.

## How to turn on

**Locally** — in `.env.local`, then restart `npm run dev`:

```
ASK_VCFO_ENABLED=true
ANTHROPIC_API_KEY=sk-ant-…          # free-text questions; suggestions work without it
ASK_VCFO_FEATURE_C1=true            # optional, any of C1 C2 C3 C4 C5 A1
```

**AWS** — done on 2026-10-01 (on in production). For reference, see `infra/README.md` "Ask VCFO":

1. Store the key in Secrets Manager as `/vcfo/ask-vcfo/anthropic-api-key`
   (plaintext, the key only).
2. Migrations 0021–0023 are applied on RDS (done 2026-09-30). For later ones:
   `npm run db:migrate` through the SSM tunnel (`docs/context/AWS-DEPLOY.md` §11.3; no production `DATABASE_URL`).
3. In `infra/terraform.tfvars`: `ask_vcfo_enabled = true`, and optionally
   `ask_vcfo_features = ["C1", "C4"]`.
4. `terraform apply`.

**Content** — run `npm run ask:topics:report`, review `TOPIC-REVIEW.md`, then
publish each topic with `npm run ask:topics:publish -- <slug> --reviewer "Name, Role"`.
