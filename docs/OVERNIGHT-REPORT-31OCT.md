# Overnight report, 31 Oct 2026

Built by the hub session with six parallel agents, on the owner's order ("Build everything… never require any approvals… built, committed, and pushed").
Branch `overnight/31oct`, merged into `main`. Every milestone has its own report in `docs/ui-port/fixes/overnight-*.md`.

## 1. Next actions (owner)

| # | Action | Why | Done |
|---|---|---|---|
| 1 | Apply migrations **0031** (Board resolution NOC) and **0032** (task `sort_order`) on RDS **before** you deploy this code. Use the SSM tunnel through the NAT instance (`node scripts/db-env-prod.mjs`, see `docs/context/AWS-DEPLOY.md` §11). Take an RDS snapshot first. Never open RDS to the internet. | Without them, the board resolution pages and every task list fail. | ✗ |
| 2 | Commit your laptop-only SOC 2 infra files (`infra/private-db.tf` and the edited `infra/*.tf`) and merge them with `main`. Then run `terraform fmt` and `terraform validate`. | `infra/network.tf` in git still shows the old public setup. M7 edited only the files that are in git. | ✗ |
| 3 | Create the `vcfo-suite/CREDENTIALS_ENCRYPTION_KEY` secret, if your laptop files do not already create it. Then `terraform apply`. | M7 moves TOTP encryption to this key. | ✗ |
| 4 | Build and push the image of `main`, with a rollback tag of the live image (`0f34763`). | This session has no AWS access. | ✗ |
| 5 | Run `npm run totp:reencrypt -- --dry-run`, then `npm run totp:reencrypt`, through the tunnel. | It moves the TOTP secrets to the new key. | ✗ |
| 6 | Test the app. Send the bugs to the hub. | Owner's testing rule: no browser tests were run overnight. | ✗ |

## 2. Milestones

| # | Milestone | Done | Commits | Report |
|---|---|---|---|---|
| M0 | Main matches the waiting work (NOC page, landing v2) | ✓ in git. ✗ deploy (no AWS access here) | `5053b56`, `9e252e0`, `2feb3b5`, `f4f15c0` | `fixes/br-noc-*.md`, `fixes/landing-v2.md` |
| M1 | Design rules R-54 to R-60 | ✓ | `ed848f7`, `ae3bdea` | `fixes/overnight-m1.md` |
| M2 | Client home: 5 fixed tiles, real trend lines, Recent activity 5 rows + View all | ✓ | `295ef1e` | `fixes/overnight-m2-m3.md` |
| M3 | Incorporation: no Registration section, timeline on top, Days to COI card, COI hides Before/After | ✓ | `6265c92` | `fixes/overnight-m2-m3.md` |
| M4 | Documents: one flat table, open-folder view unchanged | ✓ | `f064130` | `fixes/overnight-m4-m5.md` |
| M5 | Ask: tokens in dark mode, avatars, 3 sizes, full page, Ctrl K | ✓ | `39c26f7` | `fixes/overnight-m4-m5.md` |
| M6 | Work drag and drop, FullCalendar staff calendar, no strikethrough, migration 0032 | ✓ | `e0510f6`, `f2b46de`, merge `97350f1` | `fixes/overnight-m6.md` |
| M7 | SOC 2: secret rotation, runtime secrets, private DB path, console cards, read-only IAM | ✓ code. ✗ apply (owner) | `8f966ad`, `977f8a8` | `fixes/overnight-m7.md` |
| M8 | Leftovers: X-23 activity master, demo seed files, SPICe+ attachments list | ✓ | `ae762c9`, `6c673c5`, `0ae8e94`, `7854c40` | `fixes/overnight-m8.md` |

## 3. Checks on the merged branch

| Check | Result |
|---|---|
| `npx tsc --noEmit -p .` | ✓ 0 errors |
| `npx vitest run` | ✓ 387 files, 3,674 tests pass |
| `npx eslint . --quiet` | ✓ 0 errors |
| Browser, Playwright, smoke, screenshots | ✗ Not run (owner's rule) |
| `terraform fmt` / `validate` | ✗ terraform is not installed in this session |

## 4. Decisions made overnight (change any of them)

| # | Area | Decision |
|---|---|---|
| 1 | Hub | The builder on the laptop refused production actions without the owner's word in its own chat. The hub built everything itself with six parallel agents. |
| 2 | M1 | Light page background `#edf1f6`, one step darker than white cards. Dark mode already had the step. |
| 3 | M1 | Pages that draw their own 1.5 px card frame get 2 px from one rule at the end of `globals.css`; client-portal cards from a temporary `!important` rule in `23-portal.css`. |
| 4 | M1 | New `border-fine` (3 px dash, 3 px gap) only for drop zones and empty states. Other dashed edges are now solid. |
| 5 | M1 | New shared `StepLink` draws each connector through the mark centres (11 places fixed). |
| 6 | M2 | "Steps done" counts SPICe+ steps. The Expected COI date moved into the note of that tile. |
| 7 | M2 | Trend lines are rebuilt from real records for the last days. A tile with no history shows a flat dashed line and "No history yet". |
| 8 | M3 | Three stat cards on top: Days to COI (Incorporated after the COI), SPICe+ steps, All steps. |
| 9 | M4 | A new optional `signed` flag on document rows marks signed files (no schema change). |
| 10 | M5 | Past chats on the full Ask page are kept in localStorage (40 per user). A server list is still a gap. |
| 11 | M6 | "A date agreed with the client" = the manager-set window on a step; a lead's drag opens the date-change request. Compliance tasks the client sees move freely for managers. |
| 12 | M6 | Staff compliance calendar tab "Month" is renamed "Calendar". Clients keep the old month grid. |
| 13 | M7 | The Auth.js config is built per request, so the Entra secret can rotate without a redeploy. |
| 14 | M7 | `ignore_changes` on the AUTH_SECRET and Azure secret versions, so `terraform apply` does not undo a hand rotation. |
| 15 | M7 | `apprunner:DescribeService` added (read-only) for the Network card. |
| 16 | M8 | The demo seed also uploads placeholders for demo request files. |

## 5. Known gaps

| # | Gap |
|---|---|
| 1 | X-20 holidays, X-22 retention, X-24 Meta template: they wait for the owner. |
| 2 | P-304, P-305, P-312 developer console rows: not built. |
| 3 | Ask full page: no server list of past chats; suggested-question answers of the client pop-up do not show on the full page. |
| 4 | The WhatsApp verify-code hash still uses AUTH_SECRET. A code sent just before a rotation fails once. |
| 5 | Landing check T6 (Lighthouse) was never run. |

## 6. Deploy, 31 Oct 2026 10:32 IST

| Step | Done | Detail |
|---|---|---|
| Laptop SOC 2 infra files in git | ✓ | Branch `infra/soc2-laptop`, merged with main. `terraform validate` passes. |
| `main` | ✓ | Fast-forwarded to `0f746dfc`. |
| RDS snapshot | ✓ | `vcfo-suite-db-pre-0031-20261031-1021`. |
| Migrations 0031 and 0032 on RDS | ✓ | Applied through the SSM tunnel on the NAT instance. RDS stayed private. The tunnel is closed. |
| Rollback image | ✓ | `vcfo-suite:rollback-0f34763` (the image that was live before). |
| Image | ✓ | `vcfo-suite:0f746dfc` and `:latest`. App Runner START_DEPLOYMENT succeeded at 10:32 IST. |
| Live check | ✓ | `/` and `/login` answer 200. No errors in the application log after the deploy. Not checked signed in. |
| `CREDENTIALS_ENCRYPTION_KEY` secret | ✓ | Created at about 11:00 IST on the owner's command, with a random 32-byte value and the deny-all policy. |
| `terraform apply` | ✓ | 3 added, 1 changed, 0 destroyed: the key secret and its policy, the M7 read-only console grant, and the App Runner env and secret list. `credentials_key_enabled = true` is in `terraform.tfvars`. |
| `totp:reencrypt` | ✗ | Not run yet. It must run before the first AUTH_SECRET rotation (31 Jan 2027). |

To finish, the owner runs these from `infra/` (the plan above, nothing else):

```bash
terraform apply -var credentials_key_enabled=true -target='aws_secretsmanager_secret.credentials_encryption_key[0]' -target='aws_secretsmanager_secret_policy.credentials_encryption_key[0]'
aws secretsmanager put-secret-value --profile vcfo --region ap-south-1 --secret-id vcfo-suite/CREDENTIALS_ENCRYPTION_KEY --secret-string "$(openssl rand -base64 32)"
terraform apply -var credentials_key_enabled=true   # then set it to true in terraform.tfvars
```

Then run `npm run totp:reencrypt` through the tunnel (docs/context/AWS-DEPLOY.md §11.3).

## 7. Deploy, 31 Oct 2026 12:03 IST

| Step | Done | Detail |
|---|---|---|
| `main` | ✓ | `b5f3f919`: the hub's fixes for A1/A2, A7/D3, E1, B2 and F4. No migration and no infra change. |
| Gate | ✓ | 0 type errors, 0 lint errors (520 warnings), 3,702 tests pass. |
| Rollback image | ✓ | `vcfo-suite:rollback-0f746dfc`. |
| Image | ✓ | `vcfo-suite:b5f3f919` and `:latest`. App Runner deployment succeeded at 12:03 IST. |
| Live check | ✓ | `/` and `/login` answer 200. No errors in the application log. Not checked signed in. |

## 8. Deploy, 2 Nov 2026 18:03 IST

| Step | Done | Detail |
|---|---|---|
| `main` | ✓ | `fd08d4ac`: Ask VCFO robot fixes (PR #4 and PR #5). No migration and no infra change. |
| Gate | ✓ | 0 type errors, 0 lint errors (518 warnings), 3,709 tests pass. |
| Rollback image | ✓ | `vcfo-suite:rollback-b5f3f919`. |
| Image | ✓ | `vcfo-suite:fd08d4ac` and `:latest`. App Runner deployment succeeded at 18:03 IST. |
| Live check | ✓ | `/` and `/login` answer 200. No errors in the application log. Not checked signed in. |

## 9. Deploy, 2 Nov 2026 18:41 IST

| Step | Done | Detail |
|---|---|---|
| `main` | ✓ | `7fb6b705`: Labour registers (PR #6). Adds migration 0033 (6 new tables, additive only). |
| Gate | ✓ | 0 type errors, 0 lint errors (524 warnings), 3,794 tests pass. |
| RDS snapshot | ✓ | `vcfo-suite-db-pre-0033-20261102-1823`. |
| Migration 0033 on RDS | ✓ | Applied through the SSM tunnel on the NAT instance. RDS stayed private. The tunnel is closed. |
| Rollback image | ✓ | `vcfo-suite:rollback-fd08d4ac`. |
| Image | ✓ | `vcfo-suite:7fb6b705` and `:latest`. App Runner deployment succeeded at 18:41 IST. |
| Live check | ✓ | `/` and `/login` answer 200. No errors in the application log. Not checked signed in. |

## 10. Deploy, 3 Nov 2026 12:17 IST

| Step | Done | Detail |
|---|---|---|
| `main` | ✓ | `b54acd9d`: Client Details rework (PR #3), the previous landing page with the Ask VCFO robot (revert and PR #7), Board meetings (PR #8, migration 0034), Labour registers fix (PR #9) and the India map picker (PR #10). |
| Gate | ✓ | 0 type errors, 0 lint errors (529 warnings), 3,832 tests pass. Migration chain checked; no schema drift. |
| RDS snapshot | ✓ | `vcfo-suite-db-pre-0034-20261103-1202`. |
| Migration 0034 on RDS | ✓ | 9 new tables, additive only. Applied through the SSM tunnel; RDS stayed private; the tunnel is closed. |
| Rollback image | ✓ | `vcfo-suite:rollback-7fb6b705`. |
| Image | ✓ | `vcfo-suite:b54acd9d` and `:latest`. App Runner deployment succeeded at 12:17 IST. |
| Live check | ✓ | `/` and `/login` answer 200. No errors in the application log. Not checked signed in. |

## 11. Deploy, 4 Nov 2026 09:24 IST

| Step | Done | Detail |
|---|---|---|
| `main` | ✓ | `832949e1`: Labour registers lock, upload, projection and reconciliation (migration 0035), the checklist removal (PR #13, migration 0036), and Receivables phases 8 to 10 with partner portal, FX and forex desk (PR #14 and PR #16, migrations 0037 to 0040). |
| Gate | ✓ | 0 type errors, 0 lint errors (541 warnings), 4,309 tests pass. Migration chain checked; no schema drift. |
| RDS snapshot | ✓ | `vcfo-suite-db-pre-0035-20261104-0904`. |
| Migrations 0035 to 0040 on RDS | ✓ | The owner ran them through the SSM tunnel; RDS stayed private; the tunnel is closed. 0036 dropped the two labour-register checklist tables, which had 0 rows each (the owner approved this exception to the additive-only rule). |
| Rollback image | ✓ | `vcfo-suite:rollback-b54acd9d`. |
| Image | ✓ | `vcfo-suite:832949e1` and `:latest`. App Runner deployment succeeded at 09:24 IST. |
| Live check | ✓ | `/`, `/login` and `/receivables/login` answer 200. No errors in the application log. Not checked signed in. |

## 12. Deploy, 9 Nov 2026 15:54 IST

| Step | Done | Detail |
|---|---|---|
| `main` | ✓ | `9bbf5af8`: every merge since 4 Nov, including the website match (#18), the audit fixes (#19, #22), labour registers (#20, #23, #26, #27, #31), Ask VCFO (#21, #24), the Budget module (#25) with its Variance tab, advance tax and PDF pages (#28), payroll and the demo seed clients. |
| Gate | Partly | 0 type errors, 0 lint errors (532 warnings). 5,089 tests pass, 3 fail, all outside the budget work: the Ask VCFO field catalog is stale (run `npm run ask:catalog` after the checklist change in #21), and one Watch adapter test depends on today's date. |
| RDS snapshot | ✓ | `vcfo-suite-db-pre-0041-20261109`. |
| Migrations | ✓ | RDS already held 0041 to 0048. 0049 (budget variance tables) was applied through the SSM tunnel; RDS stayed private; the tunnel is closed. No duplicate bank references before 0043. |
| Rollback image | ✓ | `vcfo-suite:rollback-832949e1`. |
| Image | ✓ | `vcfo-suite:9bbf5af8` and `:latest`. App Runner deployment succeeded at 15:54 IST. |
| Live check | ✓ | `/`, `/login` and `/receivables/login` answer 200. No errors in the application log in the first minutes. Not checked signed in. |
