# Cleanup Progress
Branch: cleanup/20261103 · Level: GREEN · Started: 2026-11-03
Base: claude/keen-knuth-8on04j @ e83fec3

Gate notes: typecheck needs `NODE_OPTIONS=--max-old-space-size=8192` (the default heap runs out of
memory), and the tests need `npm run css:portal` first because the generated portal CSS is not tracked.

## Baseline metrics
[metrics] files=2682
[metrics] loc=304014
[metrics] maxfn=592 at=src/views/vault/DocumentVaultPage.tsx:127 (approx)
[metrics] fn_over_50=539 (approx)
[metrics] maxnest=30 (approx)
[metrics] loose_types=28
[metrics] todo=22

- [x] Phase 1.1 — knip hints down to zero (4 rounds; production entries marked with !, css-src build inputs in ignoreFiles)
- [x] Phase 1.2 — production report ready
- [x] Phase 1.3 — unused deps (none; skipped)
- [x] Phase 1.3 — orphan files (38 removed, gate GREEN)
- [x] Phase 1.3 — dead exports (values only, retry): 450 exports in 239 files un-exported, gate GREEN, lint 0 errors (warnings 527 -> 581: 54 newly visible unused locals, which are dead code for a later pass)
- [!] Phase 1.3 — dead exports + types (first attempt): FAILED gate, rolled back. knip --fix-type exports,types (450 exports, 153 types, 285 files) broke typecheck: src/lib/incorporation/dir-2.ts uses `import(".../shared").IncorpDirectorKind`, an inline type import knip does not see. Retry by hand in smaller batches (per folder), or exclude types.
- [ ] Phase 1.4 — audit: deferred, not run in this session (owner asked for the cleanup to run now; the nine-dimension audit is a separate long pass)
- [x] Phase 1.5 — duplication survey (DUPLICATION_SURVEY.md): 5.3% duplicated lines, 702 clone groups; feature-level client/staff page split documented

## Preview (phase 1.3)
- unused deps: none (tailwindcss-animate is used by tailwind.config.ts; kept)
- orphan files (unused in both production and dev graphs): src/components/admin/ComplianceCalendar.tsx, src/components/admin/compliance-calendar-utils.ts, src/components/ask/AskNudgeCard.tsx, src/components/auth/LoginHero.tsx, src/components/auth/LoginShowcase.tsx, src/components/compliances/FilingStatusPill.tsx, src/components/dash/DashFilterChip.tsx, src/components/dash/DashHeroSettings.tsx, src/components/dash/attention-list.tsx, src/components/dash/drill-dialog.tsx, src/components/dash/key-value.tsx, src/components/incorporation/InternStepDoneMark.tsx, src/components/intern/LeadPracticeStrip.tsx, src/components/intern/LeadWeekStrip.tsx, src/components/intern/WorkFilterChip.tsx, src/components/marketing/HeroProductPlane.tsx, src/components/marketing/Reveal.tsx, src/components/metrics/expected-coi-control.tsx, src/components/ui/badge-variants.ts, src/components/ui/badge.tsx … and 18 more (38)
- dead exports (unused even by tests, dev-mode report): 450 exports and 153 types in 285 files; only the export keyword is removed

## Decisions
- Production-only orphans (27 files used only by their own tests or fixtures) are not deleted in this run; the owner decides: src/components/dash/phase-rows.tsx, src/components/dash/stage-track.tsx, src/components/dash/week-strip.tsx, src/components/incorporation/PhaseCelebration.tsx, src/components/ui/chevron.tsx, src/db/repositories/dev-test-db.ts, src/db/repositories/work-test-stub.ts, src/lib/audit/audit-event-access.ts, src/views/announcements/AnnouncementDetailDialog.tsx, src/views/client/Overview.tsx, src/components/client/overview/ClientActivityFeed.tsx, src/components/client/overview/ClientBallInCourt.tsx, src/components/client/overview/ClientCard.tsx, src/components/client/overview/ClientCompanySnapshot.tsx, src/components/client/overview/ClientComplianceRunway.tsx, src/components/client/overview/ClientDeliverables.tsx, src/components/client/overview/ClientEntityCard.tsx, src/components/client/overview/ClientJourneyTrack.tsx, src/components/client/overview/ClientMilestoneCelebration.tsx, src/components/client/overview/ClientNextAction.tsx, src/components/client/overview/ClientOverviewHero.tsx, src/components/client/overview/ClientOverviewSkeleton.tsx, src/components/client/overview/ClientPhaseBars.tsx, src/components/client/overview/ClientTeamCard.tsx, src/components/client/overview/client-overview-format.ts, src/lib/assist-profile/__tests__/fixtures.ts, src/lib/doc-pack/__tests__/fixtures.ts
- Unlisted dependency `playwright` in scripts/build-incorp-docs-er-pdf.mjs left alone (owner script; @playwright/test is installed).
## Phase 2
- Chosen candidate (owner, 2026-11-03 checkpoint): shared block of AnnouncementLivePopup.tsx + NotificationLivePopup.tsx.
- [x] Popups consolidated into src/components/notifications/genie-popup.tsx (766 -> 667 lines), gate GREEN.
- [x] Nine nested route error.tsx files now render src/components/shell/RouteErrorPanel.tsx (406 -> 86 lines plus a 60-line panel), gate GREEN.
- [ ] Docx previews (BoardResolutionDocPreview / IncorporationDocxPreview) left apart on purpose: the imperative handles differ (board adds merge-field and formatting methods), so a merge needs a new shared hook for about 80 lines; not worth the risk unattended.
- Owner instruction (2026-11-04): run every remaining phase without waiting for approval. Error pages and docx previews follow as further low-risk consolidations; the Documents client/staff merge is out of scope for an unattended run.

## Coverage
### 1.5 duplication
- reviewed: 18 (14 churn-checked pairs + 4 feature pairs) · skipped by class: route guards, schema columns, error pages, test fixtures
- coverage_rate: below 100% by pair; gap accepted and recorded here

## Pending for the human
- Phase 1.4 audit not run
- 27 production-only orphans (see Decisions)
