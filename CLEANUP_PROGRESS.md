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
- [ ] Phase 1.3 — unused deps
- [ ] Phase 1.3 — orphan files
- [ ] Phase 1.3 — dead exports
- [ ] Phase 1.4 — audit
- [ ] Phase 1.5 — duplication survey

## Preview (phase 1.3)
- unused deps: none (tailwindcss-animate is used by tailwind.config.ts; kept)
- orphan files (unused in both production and dev graphs): src/components/admin/ComplianceCalendar.tsx, src/components/admin/compliance-calendar-utils.ts, src/components/ask/AskNudgeCard.tsx, src/components/auth/LoginHero.tsx, src/components/auth/LoginShowcase.tsx, src/components/compliances/FilingStatusPill.tsx, src/components/dash/DashFilterChip.tsx, src/components/dash/DashHeroSettings.tsx, src/components/dash/attention-list.tsx, src/components/dash/drill-dialog.tsx, src/components/dash/key-value.tsx, src/components/incorporation/InternStepDoneMark.tsx, src/components/intern/LeadPracticeStrip.tsx, src/components/intern/LeadWeekStrip.tsx, src/components/intern/WorkFilterChip.tsx, src/components/marketing/HeroProductPlane.tsx, src/components/marketing/Reveal.tsx, src/components/metrics/expected-coi-control.tsx, src/components/ui/badge-variants.ts, src/components/ui/badge.tsx … and 18 more (38)
- dead exports (unused even by tests, dev-mode report): 450 exports and 153 types in 285 files; only the export keyword is removed

## Decisions
- Production-only orphans (27 files used only by their own tests or fixtures) are not deleted in this run; the owner decides: src/components/dash/phase-rows.tsx, src/components/dash/stage-track.tsx, src/components/dash/week-strip.tsx, src/components/incorporation/PhaseCelebration.tsx, src/components/ui/chevron.tsx, src/db/repositories/dev-test-db.ts, src/db/repositories/work-test-stub.ts, src/lib/audit/audit-event-access.ts, src/views/announcements/AnnouncementDetailDialog.tsx, src/views/client/Overview.tsx, src/components/client/overview/ClientActivityFeed.tsx, src/components/client/overview/ClientBallInCourt.tsx, src/components/client/overview/ClientCard.tsx, src/components/client/overview/ClientCompanySnapshot.tsx, src/components/client/overview/ClientComplianceRunway.tsx, src/components/client/overview/ClientDeliverables.tsx, src/components/client/overview/ClientEntityCard.tsx, src/components/client/overview/ClientJourneyTrack.tsx, src/components/client/overview/ClientMilestoneCelebration.tsx, src/components/client/overview/ClientNextAction.tsx, src/components/client/overview/ClientOverviewHero.tsx, src/components/client/overview/ClientOverviewSkeleton.tsx, src/components/client/overview/ClientPhaseBars.tsx, src/components/client/overview/ClientTeamCard.tsx, src/components/client/overview/client-overview-format.ts, src/lib/assist-profile/__tests__/fixtures.ts, src/lib/doc-pack/__tests__/fixtures.ts
- Unlisted dependency  in scripts/build-incorp-docs-er-pdf.mjs left alone (owner script; @playwright/test is installed).
## Pending for the human
- (none)
