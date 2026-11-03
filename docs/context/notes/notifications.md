# Notifications bell and announcements

Gotchas already paid for once. Append when something costs more than a minute to figure out.

## Notifications live popup

- Inbox-only (the signed-in user’s **received** rows, not firm-wide, not sent
  email). New ids popup one-at-a-time; first visit seeds history so refresh
  does not replay. Storage `vcfo.notifications.popup.{userId}`.
- Poll: 4s **head** (`GET /api/notifications?head=1` → latestId / unread / count)
  then invalidate the inbox query only when that fingerprint changes. Same
  cadence as announcements; do not refetchInterval the full inbox on AppContext.
- Close (X / backdrop / Esc) genies into `[data-notifications-bell-target]`
  via shared `measureGenieDock`. Reduce-motion skips the flight. Landing
  pulses the bell. Auto-popup does **not** mark read. No Got it / parks copy.
- Clicking a received row in the bell panel reopens the card
  (`requestNotificationPopup` / `vcfo-notifications-show`).

## Notifications dismiss / history

- Bell is a **Popover** (click outside or Esc to close). Received row click
  marks read and reopens the live popup. Sent row click expands detail
  **inside the panel**. Unread is `.unread-edge` (left primary bar), not a dot.
- Clear (today / this week / all) **hides from the inbox** via
  `notifications.dismissed_at`. Rows are not deleted. Undo undismisses
  (`dismissed_at = null`). Legacy `action: 'delete'` maps to dismiss.
- **Today** = calendar date in `Asia/Kolkata`. **This week** = Monday 00:00 IST
  through Sunday 23:59 IST (includes today). Clear actions apply to the
  current Received/Sent tab.
- History: `/app/{intern|manager|admin|client|super}/notifications`,
  `GET /api/notifications?history=1`. Apply `0012_notification_dismissed_at`.
- Toast id `notification-undo` (top-right, 7s). Row exit animation 300ms.

## Announcements (not notifications)

- Announcements are firm-wide news (Finance Act, circulars, process notes). The
  bell is still per-user work alerts (`notifications`).
- Super Admin, Admin, and Project Manager can post. The author's name is stored
  on the row. Project leads and clients can read the same board; they cannot compose.
- Routes: `/app/{role}/announcements`. Navbar megaphone (unread via
  `vcfo.announcements.read.{userId}`) is the in-app list; client inbox still has a
  compact list. Kind + `author_role` on the row (migration 0010).
- Live popup: new posts (compose or RSS ingest) appear for every signed-in role
  within a few seconds. `useAnnouncements` keeps a 4s **head** poll
  (`GET /api/announcements?head=1`) and only refetches the full board when
  latest id / count changes. Do not put `refetchInterval` on the fat list —
  JSON.parse of announcement bodies on the main thread froze hover/clicks.
  The card genies into `[data-announcements-bell]` (~1s, Framer `m` + FLIP rects).
  Reduce-motion / appearance `motion === 'none'` skips the genie and just hides.
  Genie does
  **not** mark read. Already-shown ids live in `vcfo.announcements.popup.{userId}`.
  First visit seeds history and may queue today’s unseen (cap 3). Authors skip
  their own posts. Queue is one-at-a-time. Clicking a megaphone-dropdown row or
  Latest row always reopens the same card (`requestAnnouncementPopup` /
  `vcfo-announcements-show`) even if the id is already in the popup set; close
  still genies to the megaphone. Close the live card with X, backdrop, or Esc
  (no Got it button; no “parks on the megaphone” / queue footer copy). Row click
  still marks read.
- Official RSS/Atom: staff paste a **feed URL** (not a homepage) from an allowlisted
  host (`src/lib/notifications/announcements.ts` `OFFICIAL_FEED_HOSTS`). Inngest `announcement-feeds`
  runs once at 06:00 Asia/Kolkata. We do **not** scrape HTML listing or login pages
  (MCA/GST/EPFO portals, Income Tax “What's New”). If a department has no RSS, open
  the circular from the portals directory or post by hand. Tracking junk
  (`utm_source=chatgpt.com`, gclid) is stripped from URLs.
- Portals catalog: `src/lib/notifications/announcement-portals.ts`, rendered on the Announcements
  page. LEI renewal uses `ccilindia-lei.co.in` (official LOU), not the ads agent at
  legalentityidentifier.in. The old once-per-IST-day dialog
  (`vcfo.announcements.daily.{userId}.{ymd}`) is only a skip-list on first popup
  init so those users are not replayed.
- Apply schema: `npm run db:migrate` (0009_announcements, 0010_announcement_kind).
- Megaphone dropdown filters All / Important / General. There is no `important`
  kind: Important = `deadline` + `compliance`; General = `general`; All = every
  kind. Unread uses a 3px left primary bar (`.unread-edge`) plus a name-dot;
  same bar replaces the notifications unread dot. Writer CTA goes to
  `/app/{role}/announcements?compose=1`. Storage is still
  `vcfo.announcements.read.{userId}`. Genie target: `[data-announcements-bell]`.

## Pre-incorporation direct flow events (2026-10-13)

- New events `step_submitted`, `step_waiting_on_lead`, `step_reopened`. Bell recipients for
  these and for the board resolution (`lead_requested_review` / `review_rejected` on `pre-2`,
  `board_resolution_shared`) come from one pure table, `directFlowBellAudience` in
  `engagement-event-fanout.ts`; the actor is excluded and each person gets one row.
- Bell text: title `{Step} submitted`, body `{Name} ({Client | Project Lead}) submitted this
  step for {Company}.` The actor name travels in `NotifyInput.actorName/actorRole`, not a column.
- Kinds reused: `checklist.submit` (submitted, waiting on lead), `checklist.unlock` (reopened).
- Client-side diff toasts (`diffChecklistForNotifications`) emit one "{Step} submitted" toast
  for a direct-flow step and skip the deliver / review / accept rules there.
- Autosave still sends nothing: direct-flow lead patches cannot carry review stamps
  (stripped in `POST …/checklist`), so `leadManagerRequestNotifyPlan` never fires.

## The client's approval round reaches the bell (2026-11-03)

- `approvalBellLines` (pure, `engagement-event-fanout.ts`) decides the bell rows for the client's
  approval round. Before this, `phase_approved`, `client_change_requested` and
  `step_awaiting_client_approval` only mailed; none of them wrote a bell row.
- New event `client_approved_step`: the client approved one step that did not finish a phase.
  Leads and managers get "{Step} approved" (bell only, no mail). The approve route sends it when
  `clientApproveStep` returns neither `phaseCompleted` nor `alreadyApproved`; the phase case keeps
  `phase_approved` (mail + now a bell row). A repeated approve sends nothing.
- `client_change_requested` → leads and managers ("Change requested", with the client's note);
  the timeline variant passes `requestLabel: 'the timeline'`.
- `step_awaiting_client_approval` → the client ("Ready for your approval").
- `POST /api/client/steps/:id/files` (a file the firm asked for, uploaded from the step page) now
  fires `client_uploaded` like the Documents-page upload: bell + mail to leads and managers. Undo
  sends nothing.
- Direct-flow Submit by the client already reached the lead (`step_submitted` /
  `step_waiting_on_lead`); unchanged.
