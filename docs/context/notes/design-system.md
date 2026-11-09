# Design system: tokens and canonical components

## Design tokens, v1 (2026-10-21)

The system lives in `docs/design/`: `TOKENS.md` (the spec and the decisions),
`design-tokens.json` (source of truth; `scripts/design-tokens-css.mjs --write`
regenerates the block in `app/globals.css`), `COMPONENTS.md` (which component
owns each pattern), `AUDIT.md` (what was wrong and the before counts), and
`BRIEF.md` (the brief this was built from). `node scripts/design-tokens-check.mjs`
is the contrast gate.

The short version, which overrides everything in the "superseded" section below:

- One face: Public Sans (`--font-sans`), weights 400/500/600. IBM Plex Mono for
  identifiers only. `--font-serif` and `.serif` alias the sans until their
  callers move to the type styles.
- Colour tokens are semantic and themed: `surface`, `surface-raised`,
  `surface-sunken`, `line`, `line-strong`, `ink`, `ink-muted`, `ink-faint`,
  `brand` (action blue `#1b4f94`), `brand-strong`, `brand-soft`, `on-brand`,
  `highlight` (the one orange, text-safe), `highlight-bright`, `highlight-soft`,
  `positive`/`warning`/`danger`/`info` each with `-soft`, `focus-ring`, `scrim`,
  `side*` (the navy sidebar and hero), `data-1..6` (charts only).
- Old names (`--primary`, `--gold`, `--accent-*`, `--phase-*`, `--role-*`,
  `--stat-*`, the portal's `--navy`/`--ok`/`--due`/`--over`...) are aliases of
  the tokens above and are deleted on 2026-11-30.
- Two things carry colour: a state and a client company. Each client keeps one
  colour from the eight-hue client set on every screen (dot and initials tile;
  owner decision, 2026-10-22). People, tags and nav items are neutral. Status
  gets a solid chip, a soft tint or a coloured word, always with a word.
- Pages have no title (the breadcrumb and nav name them); breadcrumb segments
  are links; Back returns to the previous screen. Grids use the table rows with
  28px, 6px-corner cells. Full list: `docs/design/TOKENS.md`, "v1.2".
- Chips are 22px, 6px corners, 84px/88px minimum width in columns; buttons are
  28/32/40 high and at least 84px wide. No pills except toggles and rings.
- Borders before shadows (`shadow-card`, `shadow-float` only), no gradients, no
  coloured left borders, no cards inside cards, no blur.
- The client portal CSS (`css-src/`) points its own variables at these tokens;
  `node scripts/cp-css.mjs` rebuilds `css/` after any edit.

## Superseded: the cool-blue notes from 2026-09 (history only; the rules above win)

- **Primary is professional blue** (`--primary` / `--brand` / `--blue-*` ≈ `#2563EB`,
  hover `#1D4ED8`). Buttons, links, focus rings, current-step nodes, progress,
  key CTAs. White label on blue — never navy-on-blue. Do **not** use orange,
  terracotta, peach, or sand as brand or page atmosphere.
- Neutrals: cool slate with a blue undertone (`--background` ≈ `#F8FAFC`, cards
  white, borders `--border` ≈ slate-200). Never beige/cream.
- `--orange-*` / `--gold-*` are **deprecated aliases of `--blue-*`** so leftover
  class names still resolve blue. Prefer `primary` / `blue-*` in new UI.
- Phase washes (journey chips only, ~8–12% chroma): `--phase-pre` sky,
  `--phase-filing` teal, `--phase-post` teal-green, `--phase-fema` indigo,
  `--phase-registration` violet-blue. Helper: `src/lib/shell/phase-colors.ts`.
- Status (chips/icons only, never page fill): teal-green done · coral waiting ·
  slate lock · rose/red overdue/error. Never khaki, ochre, or brown — waiting
  used to be muted gold and read as brown; it is now coral. Categorical
  `--accent-amber` is lemon, `--accent-orange` is tangerine (high chroma).
- Super Admin: tiny `.super-gold-chip` badge only — never a gold CTA theme.
- Shared journey node: `JourneyNode` (blue active pulse, teal check, coral
  clock icon, slate lock). Motion: `.journey-node-pulse`, `.journey-unlock`,
  `.journey-complete`, `.page-fade-up`, `.skeleton-brand`, `.page-atmosphere`
  (faint blue mesh ≤4%).
- Dark mode stays in the same cool blue/slate family — not a brown invert.
- Fonts: Manrope (UI) + Space Grotesk (display via `--font-serif`) + IBM Plex Mono

## Canonical components (inventory, 2026-09-07)

Produced by reading the **Project Lead dashboard** (`src/views/intern/Today.tsx`
plus `src/components/intern/Lead*.tsx`) as the super admin dashboard spec required (removed 2026-09-30; in git
history). The lead dashboard is the canonical
design system: where two versions of a primitive exist, the one the lead
dashboard uses wins, and everything else is deprecated for new surfaces.

> Repo correction to the context doc: `app/app/intern/*` holds **route shells
> only** (`export default function Page() { return <InternToday /> }`). The real
> UI lives in `src/views/intern/*` and `src/components/intern/*`.

## The table

| Element | Canonical component | File path |
|---|---|---|
| Metric / KPI region | **The hero stat row** — the lead dashboard's headline numbers live inside the hero panel, not in cards. `LeadMetricCard` (`.lead-metric` shell) is the card shape, currently imported by nothing. **See "KPI drift" below.** | [src/components/intern/LeadHero.tsx](src/components/intern/LeadHero.tsx), [src/components/intern/LeadMetricCard.tsx](src/components/intern/LeadMetricCard.tsx) |
| Panel / card container | `.surface` utility (`@apply noir-card shadow-layered`), wrapped by `DashSection` for the icon-tile + uppercase-title anatomy | [app/globals.css:576](app/globals.css#L576), [src/components/dash/DashSection.tsx](src/components/dash/DashSection.tsx) |
| Section header / title | `DashSection` header: `h-7 w-7` solid tone tile + `text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-ink` | [src/components/dash/DashSection.tsx](src/components/dash/DashSection.tsx) |
| Status pill / chip | `TONE_BADGE[tone]` on `rounded-full px-2.5 py-0.5 text-[11px] font-extrabold`; lead-side helper `internToneBadge(tone)` | [src/components/common/IconChip.tsx](src/components/common/IconChip.tsx), [src/components/intern/intern-tones.ts](src/components/intern/intern-tones.ts) |
| Progress bar / track | `LeadPhaseProgress` — `h-2.5` flex of `rounded-full bg-raised` segments filled with `bg-[oklch(var(--phase-*))]`, flexed by step count | [src/components/intern/LeadPhaseProgress.tsx](src/components/intern/LeadPhaseProgress.tsx) |
| Progress ring | `DashHeroRing` (hero, white-on-gradient) / `ProgressRing` (on-surface) | [src/components/dash/DashHero.tsx](src/components/dash/DashHero.tsx), [src/components/noir/ProgressRing.tsx](src/components/noir/ProgressRing.tsx) |
| Empty state | In-panel one-liner: `text-[12.5px] text-muted-foreground` (`LeadSideRail`, `LeadPhaseProgress`). Full-page: `.surface px-6 py-8 text-center` with a `serif` line (`MyWork`'s `EmptyWork`). Illustrated variant: `EmptyStateIllustrated` | [src/components/intern/LeadSideRail.tsx](src/components/intern/LeadSideRail.tsx), [src/views/intern/MyWork.tsx](src/views/intern/MyWork.tsx), [src/components/noir/EmptyStateIllustrated.tsx](src/components/noir/EmptyStateIllustrated.tsx) |
| Callout / info notice | **No shared callout exists on the lead dashboard.** The primitive in the tree is shadcn `Alert` (`src/components/ui/alert.tsx`, registered, zero callers as of 2026-09-07). The "colourful but calm" tinted-info treatment used on real surfaces is inline: the login form's private `AlertBanner` (`rounded-md border border-l-[3px] px-3 py-2.5` + `border-l-{tone} bg-{tone}-light border-{tone}/20`, `role="status"`), the login showcase card `border-l-info border-info/20 bg-info-light` + icon shell, and onboarding's `rounded-md border border-primary/25 bg-primary-light p-4`. New notices compose `Alert` + `IconChip tone="info"` with the login info tint — do not add a second callout component. | [src/components/ui/alert.tsx](src/components/ui/alert.tsx), [src/components/auth/LoginShowcase.tsx](src/components/auth/LoginShowcase.tsx), [src/views/onboarding/steps/Step5Review.tsx](src/views/onboarding/steps/Step5Review.tsx) |
| Loading skeleton | Per-panel `animate-pulse rounded-md bg-muted/40` blocks; never a full-screen boot screen | [src/views/admin/AnalyticsCharts.tsx](src/views/admin/AnalyticsCharts.tsx), [src/components/client/overview/ClientOverviewSkeleton.tsx](src/components/client/overview/ClientOverviewSkeleton.tsx) |
| Donut chart | `DashDonut` + `DashLegendRow` (generalised from `LeadSideRail`'s compliance donut) | [src/components/dash/DashSection.tsx](src/components/dash/DashSection.tsx) |
| Cartesian charts | **Was ad hoc** (`AnalyticsCharts.tsx` inlined axis/grid/tooltip props). Now `src/components/charts/*` — see "New canonical pieces" | [src/components/charts/](src/components/charts/) |
| Page header + back button | `PageBackCluster` / `PageBackButton`; crumb text from `shell-crumbs.ts` | [src/components/shell/PageBackButton.tsx](src/components/shell/PageBackButton.tsx), [src/components/shell/shell-crumbs.ts](src/components/shell/shell-crumbs.ts) |
| Page transition wrapper | `PageTransition` (wraps every view) + `SEO` | [src/components/shell/PageTransition.tsx](src/components/shell/PageTransition.tsx) |
| Sidebar / shell / top bar | `AppShell` → `RoleSidebar` (`superAdminItems` nav array) + `TopBar` + `CommandPalette` | [src/components/shell/AppShell.tsx](src/components/shell/AppShell.tsx), [src/components/shell/RoleSidebar.tsx:156](src/components/shell/RoleSidebar.tsx#L156) |
| Greeting card (hero) | `DashHero` — **the only one**. Clock line + settings popover on top, serif title with optional sub-line, ring, hairline, stat strip; hero skin, ambient motion and reduced motion from `useShellAppearance`. `LeadHero` and `ClientOverviewHero` are thin content wrappers around it. | [src/components/dash/DashHero.tsx](src/components/dash/DashHero.tsx), [src/components/dash/DashHeroSettings.tsx](src/components/dash/DashHeroSettings.tsx) |
| Motion | `src/lib/shell/motion.ts` — `cardHover`, `tweenShort`, `fadeUp`, `springSnappy`, `staggerKids`; `layoutId` pills via `MotionActivePill` | [src/lib/shell/motion.ts](src/lib/shell/motion.ts) |
| Phase colours | `phaseKeyFromId` + `PHASE_CLASSES` + `--phase-*` tokens | [src/lib/shell/phase-colors.ts](src/lib/shell/phase-colors.ts) |
| Spacing / radius / typography | Panel gap `gap-3`; panel padding `px-4 pt-3 pb-3 pt-2.5`; radius `var(--radius)`; type scale `10.5 / 11 / 11.5 / 12 / 12.5 / 13 px` with `font-extrabold` labels; serif display for numbers (`.serif`), Manrope UI, IBM Plex Mono for identifiers | [app/globals.css](app/globals.css) |

## Composition rules read off the lead dashboard

- **Page skeleton:** `PageTransition` → `SEO` → `div.flex.flex-col.gap-3` →
  hero → `grid xl:grid-cols-[minmax(0,1fr)_318px]` (main column + fixed side
  rail). Both `Today.tsx` and the current super dashboard use exactly this.
- **KPI placement:** the lead's headline numbers live **inside the hero panel**
  (`LeadHero`'s stat row: serif value + small label, `border-l border-white/20`
  separators, each deep-linking into `/app/intern/tasks?focus=…`). There is no
  card band under the hero — the hero *is* the metric region. A screen that
  shows the same numbers in the hero *and* in a card band prints every number
  twice; the super admin surface follows the lead and keeps them in the hero
  only.
- **Panel anatomy:** `.surface` → header row `px-4 pt-3` with a `h-7 w-7`
  solid-tone icon tile and an uppercase 11.5px title → body `px-4 pb-3 pt-2.5`.
  `DashSection` encodes this exactly; use it rather than hand-rolling.
- **List rows:** `divide-y divide-border` or `border-t border-border`, row body
  `py-2.5`, 13px semibold title, 11px muted meta, status as a `rounded-full`
  `TONE_BADGE` pill, actions right-aligned as `rounded-full border border-border
  px-3 py-1 text-[11px] font-bold` buttons.
- **Status language:** colour appears only in chips, icon tiles, dots and chart
  fills — never as page or panel fill.

## Known duplicate primitives (do not fork further)

The context doc's §0 warning is real. What is actually in the repo:

| Duplicate | Verdict |
|---|---|
| `LeadMetricCard` (`src/components/intern/`) | The lead dashboard's KPI card. **Currently imported by nothing** — the lead hero absorbed the numbers. Kept as the shape reference. |
| `ClientKpiRow`'s private `KpiTile` (`src/components/client/overview/`) | A fork of `LeadMetricCard` with a caption instead of chips. This is the drift §0 describes. |
| `AccentKpi`, `KpiCard`, `MetricCard` | Not present in this tree (already removed). `KpiNumber` (`src/components/noir/`) survives as a number-only primitive. |
| `Surface` (`src/components/noir/Surface.tsx`) vs `.surface` utility | The lead dashboard uses the **`.surface` utility class**. Prefer it. |
| `listComplianceInstances` role branch | Bug, noted not fixed: `src/db/repositories/compliance.ts:167` tests `ctx.role === 'admin'`, so `super_admin` falls through to the client scope. Super-admin compliance reads must not depend on it. |

## New canonical pieces added by the super admin build

Extracted shared, per §2's escape hatch — used by super admin now, available for
lead/client convergence later.

| Piece | Path | Why |
|---|---|---|
| Shared chart layer | [src/components/charts/](src/components/charts/) | Themed tooltip, token-derived colour scale, default axis/grid/bar props, lazy recharts loader with the canonical skeleton. Every chart on every dashboard uses this; `AnalyticsCharts.tsx` should adopt it next. |
| `DashDataTable` | [src/components/dash/DashDataTable.tsx](src/components/dash/DashDataTable.tsx) | The list/table style, factored out of `MyWork`'s `ListView` (same header type scale, `border-t border-border` rows, `hover:bg-raised/70`) so the projects and document lists do not invent a second table. |
| `DashFilterChip` | [src/components/dash/DashFilterChip.tsx](src/components/dash/DashFilterChip.tsx) | The list filter chip, lifted verbatim from `MyWork`'s private `FilterChip`. `MyWork` should adopt it. |
| `DashHero` | [src/components/dash/DashHero.tsx](src/components/dash/DashHero.tsx) | Not new, but **absorbed the other two heroes**. It claimed to be "the lead greeting card, generalised" while rendering a different title face, pill-shaped stats, no clock and no settings. It now carries the lead card's full chrome, and `LeadHero` / `ClientOverviewHero` render it instead of their own copies — so there is one greeting card across all five role shells. |
| `DashHeroSettings` | [src/components/dash/DashHeroSettings.tsx](src/components/dash/DashHeroSettings.tsx) | `LeadHeroSettings`, moved into the dash kit now that every hero carries it. Its settings link resolves from the pathname (`roleFromAppPathname`) rather than the app context, so the hero renders in any shell — and in tests — without a provider. |

### Left deliberately un-forked

`LeadMetricCard` and `ClientKpiRow`'s private `KpiTile` are still two spellings
of the same `.lead-metric` card. A third, shared version was drafted and then
**deleted**: with headline numbers belonging in the hero (see the composition
rules above), the super admin surface has no caller for it, and shipping an
unused canonical component would have made the duplication worse rather than
better. When the lead or client surface next needs a metric card, extract one
shared component from those two and delete both.

## Round 1 rules R-54 to R-60 (owner approved, 2026-10-30)

**R-54, R-55 and R-56 were reverted on 2026-11-05 at the owner's word:** the page is `#f6f8fb`, card edges are 1 px. Filter chips and upcoming marks were dashed until 2026-11-09, when the owner ruled out every dashed or dotted edge; they are solid now. Read the table below with that in mind. Prototype: `~/Documents/vcfo-prototype`.

| Rule | Subject | Do this | Do not do this | Where it lives |
|---|---|---|---|---|
| R-54 | Depth | Put the page on `surface`. Put every card on `surface-raised`. `surface` is one step darker than `surface-raised` in light and dark mode (light `#edf1f6` on `#ffffff`, dark `#0b0c10` on `#13151a`). | Do not put a card on a ground of its own colour. Do not give a card `bg-surface` or no background. | `docs/design/design-tokens.json`, `app/globals.css`, portal `--bg` / `--panel` |
| R-55 | Edges | Give every card, panel and section a 2 px edge in `line`. Write `border-2 border-line` in new code. Keep 1.5 px on inputs and buttons. Keep 1 px `line-soft` dividers between table rows. | Do not use a 1 px or 1.5 px edge on a card. | `.noir-card` / `.surface`, `DashHero`, `StatCard`, `StageTrack`, the R-55 rule at the end of `app/globals.css`, the R-55 rule in portal `23-portal.css` |
| R-56 | Fine edges | Drop zones and empty states use one solid 1.5 px edge: the `border-fine` class (`border-t-fine` for a divider). Set the colour with `--edge-color`. No dashed or dotted edge anywhere, on anything (owner's word, 2026-11-09). | Do not write `border-dashed`, `border-dotted`, `dashed` or `dotted` in CSS, and no `stroke-dasharray` as a box edge. A locked or not-started mark is a solid `line-strong` edge on a raised surface. | `app/globals.css` (`.border-fine`), portal `23-portal.css`, `EmptyState`, `src/lib/ui/no-dashed-edges.test.ts` |
| R-57 | Checkboxes | Use one checkbox look: a 16 px square, 1.5 px `line-strong` edge, 4 px radius. Show it empty when the item is not done. Show a brand fill and a white tick when the item is done. | Do not draw a checkbox with a dotted or dashed edge. Do not use the browser's own checkbox look or `accent-color`. | `ui/checkbox.tsx`, native `input[type=checkbox]` rule in `app/globals.css` and portal `23-portal.css` |
| R-58 | Step connectors | Draw the line between two step marks or checkboxes with `StepLink`. Give it the mark centre (`x`, `y`). Each row draws a half-line up to its mark centre and a half-line down from it. | Do not place a connector with a hand-tuned `left-[..px]` offset. | `ui/step-track.tsx` (`StepLink`, `StepMark`) |
| R-59 | Done items | Show a done item with a tick (the R-57 checkbox, or a green tick where the row has no checkbox), the Done chip where the row has chips, and muted text. | Do not use `line-through` on any text. | Task rows, checklists, to-dos, change and audit diffs |
| R-60 | No floating numbers | Put every stat in a design-system card (`DashHero` tile, `StatCard`, `.surface` band, `RecordStats`). | Do not put a number or a stat heading as a bare line on the page. | `RecordStats` in `src/components/incorporation/RecordHead.tsx` |
