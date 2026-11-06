# Phase 10: Ask VCFO on every dashboard and for every role

Status: planned on 6 November 2026, not built. The owner chose to build this after testing the
chatbot PR, so that real use can shape the starter questions. It is not part of phases 0 to 9.

## The gap

Ask is mounted through `AskShellMount` in `AppShell` and `ClientPortalShell`, and `canUseAsk` admits
client, intern, manager, admin and super_admin. So the chat already reaches five of the seven roles.
The real gaps are these:

- The chat does not know each dashboard. Admin, manager and intern all share the `admin` Ask shell
  (`ASK_SHELLS` in `src/data/ask/schema.ts`), so they share one set of starting points.
- The `partner` role has no chat. Its `/receivables` pages sit outside `AppShell`.
- `/receivables/manager`, used by super_admin, admin and manager, also sits outside `AppShell` and
  does not mount Ask, so those people lose the chat on that page.
- The `developer` role is refused on purpose, because every data guard refuses a developer session.

## The decision

Keep one chat, on the same engines, access rules and budgets. Add one page map in code instead of a
chatbot per dashboard. A separate chatbot per dashboard repeats rules and costs more to keep correct.
Having the chat read the screen burns tokens and risks showing data the person should not see.

## The page map

`src/lib/ask/page-map.ts` holds one row per page type, keyed by route pattern, because about 200 pages
across about 40 areas reduce to far fewer page types where roles share views. Each row gives:

- the area, and the record type and route parameter when the page shows one record;
- the metric ids and action ids that apply on that page;
- the starter questions, per role where they differ.

Adding a dashboard means adding one row. A test fails when a route under `app/app` has no row, with an
explicit list of pages that are deliberately left out, such as profile and settings. The lookup is plain
code. Measure what it adds to a model call before and after, and report the numbers.

Phase 4 already sends the current page and record as chat context. Phase 10 builds on that field and
does not add a second one. Confirm its final shape once phase 4 is merged.

## What people see

Everything stays calm, with no new sidebar entries, and no existing animation or popup is removed.

- **Ask about this.** A small icon on a number or card, reusing `WhatsThisButton`. "Why 12 overdue?"
  answers from the metric and opens the filtered list, with no model call.
- **Filter by talking.** "Show GST overdue for Acme" sets the page's filters, only where the page
  already keeps them in the URL. It reuses the existing go-there link and `AskFocusHandler`.
- **Opening brief.** The chat opens with a line built by code, such as "3 approvals waiting, 2 filings
  due", at no token cost.
- **Pending badge.** The robot shows how many changes are waiting for this person's approval.
  Notifications still come from the app, never from the chat.

## Role by role

| Role | Today | Phase 10 adds |
|---|---|---|
| super_admin | Chat in the `super` shell | Firm-wide growth, risks and token reports as starting points |
| admin | Chat in the `admin` shell | Its own starter set; chat on `/receivables/manager` |
| manager | Chat in the `admin` shell | "What's waiting on me?", approvals through the existing card; chat on `/receivables/manager` |
| intern (project lead) | Chat in the `admin` shell | Today, tasks and requests, for assigned clients only |
| client | Chat in the `client` shell | Page map rows; actions on their own fields arrive in phase 7 |
| partner | No chat | A new `partner` shell, read-only: balances, invoices and statements |
| developer | Refused by design | Stays out. An optional later step is job and deploy status only, by code |

The token link at `/receivables/s/[token]` has no signed-in person, so it gets no chat.

## Safety rules

- Page context is a hint and never grants access. The server rechecks the person's access to every record.
- Access stays on the real session role, never on the URL, because admin and manager share views.
- The partner shell has its own flag, `ASK_PARTNER_ENABLED`, off by default in production. Partner
  answers go through role-scoped receivables repositories, with cross-tenant tests before launch.
  Partners get no write actions, and payment execution stays T4 for everyone.
- No developer session reads client data, and rule G-01 does not change.
- Existing per-path budgets and kill switches cover every new entry point.

## Build order

1. Page map, its coverage test, and per-role starter questions, using the question-gap report and what
   the owner finds in testing.
2. Ask about this and the opening brief.
3. Filter by talking, on pages that already keep filters in the URL.
4. Chat on `/receivables/manager` for its existing staff roles.
5. Partner shell behind its flag.
6. Developer status, only if the owner asks for it.

## Done when

- Every route under `app/app` has a page map row or is on the explicit left-out list, enforced by a test.
- Each of the five current roles sees starter questions that fit its page, checked in the browser.
- A number with Ask about this answers with zero provider calls, proved by a test that fails if the
  provider is called.
- A partner sees only their own balances, proved by cross-tenant tests, and sees no chat with the flag off.
- The eval set still passes, and tokens per answer are no higher than the final phase 9 numbers.
