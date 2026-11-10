# Demo data for a live walkthrough

Two sets of demo data exist and they do not overlap.

| | `npm run db:seed-demo` | `npm run demo:seed` |
| --- | --- | --- |
| Purpose | fill a dev database so every screen has something | a named client story to walk a prospect through |
| Projects | ten invented companies | the six the owner demos |
| Profile tag | `@demo.vcfo.local` | `@demo.sbctrack.in` |
| Slug tag | `demo-` | `sbcdemo-` |
| Storage tag | `demo/` | `sbcdemo/` |
| Safe on production | no (it writes firm-wide rows and calls the firm-wide compliance generator) | yes |

Because the tags differ, one never deletes the other. `npm run db:purge-demo` is the
blunt instrument and still removes both, along with everything else that is not a
`@vcfo.local` seed login.

## The walkthrough set

`scripts/seed-demo-clients.ts` creates six projects, one per state worth showing:

| Project | Stage (DB → label) | What it shows |
| --- | --- | --- |
| Emburse India | `Pre-Incorporation` → Incorporation | SPICe+ in flight; the live step sits in review |
| Emburse WebPT India | `Operational Readiness` → Compliance | incorporation and all 48 steps closed |
| Emburse Buntera India | `Post-Incorporation` → Registration | post-incorporation work in progress |
| Rootware Labs India | `Post-Incorporation` → Registration | SPICe+ and post-incorporation done, registrations next |
| XYZ Ventures India | `Post-Incorporation` → Registration | incorporated elsewhere, SBC picked it up at registration |
| ABC Industries India | `Operational Readiness` → Compliance | incorporation and registrations done elsewhere |

Emburse is one client organisation holding three projects, so the Emburse login
demonstrates the multi-project client portal. Rootware, XYZ and ABC are their own clients.

### How "somebody else did this" is represented

A step another firm handled is stored `status: 'not-applicable'` with a note, the same
shape `createEngagementWithClient` already writes for a standalone company's board
resolution steps. `isChecklistStepSequentiallyComplete` treats `not-applicable` as
complete, so the sequential gate flows past those steps and opens exactly the live one.
The certificate of incorporation step stays `completed` even for those projects, so the
CIN, PAN and TAN still show on the overview.

## Commands

```bash
npm run demo:seed          # local database, from .env.local
npm run demo:clean
npm run demo:seed:prod     # production RDS, through an SSM tunnel this opens itself
npm run demo:clean:prod
```

Seeding clears its own tagged rows first, so it is idempotent — run it as often as you like.

## Why the production commands work the way they do

Production RDS is private and has no `DATABASE_URL`, so nothing on a laptop can reach it
without the SSM port forward on the NAT instance (`docs/context/AWS-DEPLOY.md`).
`scripts/db-env-prod.mjs` prints those two steps to run by hand. `scripts/demo-prod.mjs`
does them for you: it asks AWS for the RDS endpoint, its managed master secret and the NAT
instance, reads the App Runner service's own `S3_BUCKET` and `S3_REGION` so placeholder
PDFs land in the bucket the app actually reads, opens the forward, runs the seed through
it and closes the forward afterwards. No password is printed or stored; the seed reads the
rotating RDS secret itself when it connects.

Going through the database rather than the public API was the deliberate choice. There is
no bulk-import endpoint, and driving ~35 route handlers in sequence would need a signed-in
session, would be gated by the same sequential checklist the demo is meant to show
already finished, and could not set a `completed_on` date in the past.

### Needs on the machine that runs it

- AWS CLI with credentials for the account that holds the deployment, and the
  Session Manager plugin (`aws ssm start-session` fails without it).
- Nothing else. `certs/rds-global-bundle.pem` is in the repository.

## Gotchas

- `DEMO_PASSWORD` overrides the shared password (`SbcDemo@2026` by default). The accounts
  are real logins on a real deployment, so change it before a demo that anyone watches.
- Compliance filings are generated with the pure `generateComplianceInstances`, expanded
  only for these six engagements. `systemGenerateComplianceInstances` is deliberately not
  called: it is firm-wide and would touch real clients' calendars.
- `compliance_obligations` rows are inserted `onConflictDoNothing` and are **not** removed
  on cleanup. They are the static library in `src/lib/compliance/obligations-seed.ts`, not
  demo data, and the app needs them.
- If storage is unreachable the database seed still finishes and warns; document rows then
  point at objects that are not there, and the Documents pages will say so.
- Credentials vault rows are not seeded. `CREDENTIALS_ENCRYPTION_KEY` is not set on App
  Runner yet, so anything encrypted from a laptop could not be read back by the app.

## Resetting to a fresh tool (before real clients)

`scripts/reset-client-data.ts` removes everything typed in while testing: every project
(company, parent and subsidiary details, directors, checklist answers, documents, board
resolutions and meetings, compliance calendars, tasks, notes, messages, budgets, notices),
every `client` login, the demo logins (`@demo.vcfo.local`, `@demo.sbctrack.in`, staff ones
included), prospects, client invites, notifications, the reminder log, the failed-email
outbox, exports and KPI snapshots, and the project files in S3 (keys naming a deleted project
or login; the knowledge bank is never touched). It keeps staff logins, firm settings,
templates, the obligation and activity libraries, announcements, the knowledge bank,
receivables, website demo requests and the audit log of staff actions. It refuses to run if
no admin or super admin would be left.

```bash
npm run clients:reset                     # local, counts only
npm run clients:reset -- --yes            # local, deletes
npm run clients:reset:prod                # production, counts only
npm run clients:reset:prod -- --yes       # production, RDS snapshot first, then deletes
```

The `@vcfo.local` seed staff logins survive the reset; change their passwords or remove them
once real staff accounts exist.
