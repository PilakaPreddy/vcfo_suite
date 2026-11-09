# Client journey map (plan, awaiting owner approval)

Status: planning only. Nothing here is wired into the app. The draft code in
`src/components/client-portal/pages/home/journey/` is not imported anywhere, so the live client
home page does not change until the owner approves.

## The problem

A client cannot see what is happening to their company. They need one picture, readable by a
layman, that shows where they are in the whole journey and what happens next.

## What the client will see

The map sits at the top of the client home page (`/app/client/overview`).

```
┌ Your journey ─────────────────────────────── 👤 Priya (lead) · [Tree | Metro] ┐
│  ●━━━━━━━━━━━━━━━●━━━━━━━━━━━━━━━○━━━━━━━━━━━━━━━○                              │
│  Incorporation   Post-incorp. 🏃  Registration    Compliance                    │
│  Done 14/14      6 of 11          0 of 23         Starts later                  │
├────────────────────────────────────────────────────────────────────────────────┤
│  Tree view: click to open branches, drag nodes, zoom, Fit, Reset layout         │
│  Metro view: every stage is a line, every step a station, a train on "now"      │
└────────────────────────────────────────────────────────────────────────────────┘
   Click any node → side panel with its checklist, dates, owner, SRN and the next action
```

| Level | Nodes | Source in the code |
|---|---|---|
| 1 | Incorporation, Post-incorporation, Registration, Compliance (the tracker bar) | `buildJourney().stops` |
| 2 | Pre-incorporation and Post-incorporation; registration categories; compliance areas | `PortalIncorporationModel.phases`, `buildRegistrations`, `AREA_ORDER` |
| 3 | SPICe+ Part A (Phase 1) and SPICe+ Part B (Phase 2) | `phases[0]`, `phases[1]` |
| 4 | Individual steps and filings | `PortalStep`, `HomeFiling` |

Add-ons the owner chose: a runner animation on the current stage, a side panel on click, a
short celebration when a stage is done, and the lead's photo on the active stage.

## Draft code (reusable when approved)

| File | Purpose | Status |
|---|---|---|
| `journey/journey-model.ts` and test | Pure function that turns real data into the tree, stops and current path | Draft |
| `journey/layout.ts` and test | Tidy-tree layout for the Tree view | Draft |
| `journey/JourneyMap.tsx`, `TrackerBar.tsx`, `JourneyTree.tsx`, `JourneyMetro.tsx`, `NodePanel.tsx`, `Celebrate.tsx` | UI parts | Draft, not imported |

The HTML prototype the owner reviews lives outside the repository, as a published artifact.

## Open decisions for the owner

1. Approve the prototype look, or list the changes.
2. Tree view engine: the draft uses a small hand-written SVG canvas (no new dependency). React Flow
   (`@xyflow/react`) stays an option if the owner wants more diagram features.
3. Whether staff (lead, manager) see the same map on the client record page.

## Related: the agents idea

The owner also wants named agents (Incorporation, Registration, Compliance) with sub-agents
(for example GST registration) that open a government portal and fill it after the user logs in.
`docs/specs/mca-connect/reports/` already covers this. Its verdict: MCA has no filing API; any tool
that fills the live V3 portal, including the firm's own Chrome extension VCFO Assist, needs a
written CS opinion first. Captcha or OTP bypass, stored client logins and signing for a signer
are prohibited. The agents plan must start from that report, and the user must always log in
and submit themselves.

## When approved

1. Wire `JourneyMap` into `src/components/client-portal/pages/home/HomePage.tsx` above `HomeCard`.
2. Run `npm run check`, then `npm run e2e:smoke`, and add `e2e/client-journey.spec.ts`.
3. Check desktop and phone, light and dark, with reduced motion.
4. Update `docs/context/STATE.md`.
