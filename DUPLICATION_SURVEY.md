# Duplication survey (cleanup phase 1.5)

Run on 2026-11-03 on branch `cleanup/20261103`, after phase 1 removed 38 orphan files and 450
dead exports. Tool: `npx fallow@3.14.0 dupes --mode mild --min-tokens 50` (similarity-ts was not
installed). Git history was unshallowed first (744 commits), so the churn rule has signal.

## Headline numbers

| Measure | Value |
|---|---|
| Files scanned | 1,971 |
| Files with at least one clone | 626 |
| Duplicated lines | 16,080 of 304,326 (5.3%) |
| Clone groups | 702 (664 inside `app/` and `src/`, outside tests) |

## The duplication the detector cannot see: one feature, two pages

The client portal is a separate page tree, not a role-aware view of the staff pages. These pairs
were rewritten rather than copied, so a token detector does not flag them, but they are the
largest duplication in the product and the cause of "the client and the lead see different HTML".

| Feature | Client renders | Staff renders |
|---|---|---|
| Documents | `src/components/client-portal/pages/documents/DocumentsPage` | `src/views/vault/DocumentVaultPage.tsx` (longest function in the repo, 592 lines) |
| Team | `src/components/client-portal/pages/team` and `src/views/client/ClientTeam.tsx` | `src/views/admin/Team` |
| Incorporation | `src/components/client-portal/pages/incorporation` | `src/views/admin/EngagementDetailClient` |
| Credentials | `src/components/client-portal/pages/credentials/CredentialsPage` | staff credential views |

`src/components/client-portal/pages` holds 25,523 lines of client-only pages; `src/views` holds
50,978 lines of staff pages. Labour registers already show the better pattern: every role's
route renders the same `src/views/labour-registers/*` components.

## Copy-paste pairs, with the churn rule

`co/min` is the number of commits that touched both files over the smaller file's commit count.
At or above 1/3 the pair moves together and is real duplication.

| Pair | Size | co/min | Verdict |
|---|---|---|---|
| `components/announcements/AnnouncementLivePopup.tsx` ↔ `components/notifications/NotificationLivePopup.tsx` | 90 + 38 lines | 11/12 | Real duplication, phase 2 candidate |
| `components/board-resolution/BoardResolutionDocPreview.tsx` ↔ `components/incorporation/IncorporationDocxPreview.tsx` | 84 lines | 2/3 | Real duplication, phase 2 candidate |
| `lib/board-resolution/board-resolution-preview-errors.ts` ↔ `lib/incorporation-docs/preview-errors.ts` | 71 lines | 2/2 | Real duplication; goes with the pair above. `lib/incorporation-docs` is ported domain code, so touch it only with the owner's approval |
| 10 route `error.tsx` files under `app/app/{admin,manager,intern,client}` | 18 to 59 lines each | 2/2 for the admin/manager pair | Real duplication: one shared error component would replace them |
| 5 role pages `app/app/*/labour-registers/page.tsx` | 21 to 25 lines each | 5/5 | Real duplication in route wiring only; the views are already shared |
| `components/client-portal/pages/home/CardsB.tsx` ↔ `pages/home/derive.ts` | 70 lines | 7/14 | Real duplication inside one feature |
| `db/repositories/compliance-tasks/read.ts` ↔ `views/compliances/tasks/api.ts` | 57 lines | 2/3 | Real duplication across the seam (a view repeating repository logic) |
| `views/admin/FirmDashboard.tsx` ↔ `views/admin/FirmProjects.tsx` | reported 314 lines | 2/4 | Real duplication; read the pair first, as the reported span is larger than the second file |
| `db/repositories/ask-handoff.ts` ↔ `db/repositories/client-change-requests.ts` | 61 lines | 1/4 | Left alone on purpose: separate domains that change apart |
| `db/repositories/audit-events.ts` ↔ `lib/documents/milestone-document-storage.ts` | 48 lines | 1/4 | Left alone on purpose |
| `app/api/engagements/[id]/progress-cc/route.ts` ↔ `lib/email/fetch-engagement-progress-cc.ts` | 36 lines | 0/2 | Left alone on purpose by churn, but worth a look: the route may predate the helper |
| `components/staff/today/today-rows.ts` ↔ `views/manager/team-work.ts` | 33 lines | 0/1 | No signal (one commit) |
| `components/super/parts/super-parts.tsx` ↔ `views/client-record/client-identity.tsx` | 30 lines | 1/2 | Real duplication, small |

## Repeated boilerplate (not consolidation candidates by themselves)

Most of the remaining 650 groups are short, repeated blocks of three kinds. They are listed so
the next cleanup does not re-flag them one by one.

- **API route guards**: the `auth.ok === false` → `NextResponse.json` block repeated across
  `app/api/**` (groups of 7 to 11 routes, 8 to 27 lines). A shared `withGuard` wrapper would
  remove them; this is a mechanical change for a later pass.
- **Drizzle schema columns**: repeated timestamp and owner column blocks across `src/db/schema*.ts`.
  Left alone on purpose; schema files are read by drizzle-kit and are clearer spelled out.
- **Test fixtures**: excluded from this survey.

## Coverage

- reviewed: 14 pairs or families with churn, plus the 4 feature pairs above
- skipped as boilerplate classes: the remaining groups (route guards, schema columns, error
  pages), recorded by class above rather than pair by pair
- coverage_rate: below 100% by pair; the gap is recorded under Decisions in `CLEANUP_PROGRESS.md`
