# Budget prototype scripts

These scripts make `docs/specs/budget/budget-prototype.html`, the offline demo of the Budget
module. The file holds every Budget screen of the nine dashboards, captured from the running
application, and a filter bar to move between them. It opens from disk with no internet and makes
no network requests.

## What the file shows

| ID | Dashboard | Budgets | Signed in as |
|---|---|---|---|
| D-01 | Super admin | list, Solstice, Halcyon, Pinewood | `super@vcfo.local` |
| D-02 | Admin | list, Solstice, Halcyon, Pinewood | `admin-nadia@demo.vcfo.local` |
| D-03 | Manager | list and each budget | the manager of each client (`engagements.manager_id`) |
| D-04 | Project lead | list and each budget | the lead of each client (`engagements.intern_id`) |
| D-05 | Client (approver) | Solstice, Halcyon, Pinewood | the client user of each engagement |
| D-06 | Client: Talent Acquisition | Pinewood | `pinewood-aditya`, as owner of CTC & hiring |
| D-07 | Client: HR | Pinewood | `pinewood-aditya`, as owner of Benefits |
| D-08 | Client: Admin team | Pinewood | `pinewood-aditya`, as owner of Admin costs |
| D-09 | Client: Finance | Pinewood | `pinewood-aditya`, as owner of Finance costs and Settings |

For each budget the capture saves every tab, every sub-view (Months, Quarters and Half-years; the
Show, View and Actuals selectors; one Variance month of each status), every dialog the role can
open (Publish, Approve, Return, Start revision, Remove, Import Excel, New budget, Owners and due
date, Send back, Reopen month), and the row panel behind each "More for this row" button. The
manager and lead lists come from the login that sees the most budgets. A client with a single
budget is sent straight to it by the app, so the client dashboards have no list. All four
section-owner dashboards sign in as `pinewood-aditya`, because `pinewood-rahul` is seeded as a pending
invite that never set a password; the dashboard is defined by the sections the person owns.

## How to make the file again

1. Start the app with the demo database (`npm run dev`), and make sure the three demo budgets
   exist. Their ids are in `common.cjs`; change them there after a fresh seed.
2. Capture. This takes about fifteen to thirty minutes, so run it in the background and read the log.

   ```bash
   DATABASE_URL=postgres://user:pass@localhost:5544/vcfo_main_budget \
     node scripts/budget-prototype/capture.cjs --out=/tmp/budget-prototype-raw > /tmp/capture.log 2>&1 &
   ```

   Options: `--base=http://localhost:3000`, `--only=super,admin` to capture some dashboards
   again, `--concurrency=3` for parallel sign-ins, and `--no-panels` to skip the row panels.
3. Build the file. This step is offline.

   ```bash
   node scripts/budget-prototype/build.cjs --raw=/tmp/budget-prototype-raw
   ```

4. Check it. This opens the file from disk, steps through every screen, opens some dialogs and
   closes them with Escape, and fails on an empty screen, a console error or a network request.

   ```bash
   node scripts/budget-prototype/check.cjs --shots=/tmp/budget-prototype-shots
   ```

## Safety

- The capture refuses every request that is not GET or HEAD, except sign-in, so no click can save.
  It never presses a confirm button: it opens each dialog and closes it with Escape. The log lists
  the writes it refused (the dashboard tiles post once after sign-in).
- The section-owner dashboards need owner rows on Pinewood. The capture records the rows it finds,
  sets one owner at a time, and writes the original rows back when it ends, also after an error or
  Ctrl+C. These dashboards run last, so no other screen shows a temporary owner.
- Passwords are read from `e2e/helpers/login.ts` at run time and are never written anywhere. The
  build stops if a demo password or an `sbcllp` address would end up in the file.
- The database must be on localhost; the capture refuses any other host.

## How the file is put together

- `player.html` is the page around the screens: the filter bar, the toast and the player script.
  `build.cjs` fills in the templates, the manifest and the embedded files.
- Each screen is three templates: `shell-NNN` (sidebar and top bar, with `<!--ROOT-->` where the page
  goes), `head-NNN` (the budget status bar and tabs) and `body-NNN` (the tab content). Dialogs are
  `dialog-NNN` and row panels `panel-NNN`. Identical markup is stored once, and a comment above each
  template lists the screens that use it.
- The manifest maps `dashboard|budget|tab|sub-view` to its templates. It also lists the tabs, the
  captured sub-views, the dialogs per trigger and the panels per row.
- The stylesheets are the app's own files, read from the server and inlined as they are, in
  `css-staff` and `css-client`. Fonts and images are embedded once as data URIs, and the templates
  refer to them as `__A0__`, `__A1__` and so on. Cyrillic, Greek and Vietnamese font files are left
  out to keep the file small.
- The player builds the frame itself, after the templates are parsed, and draws the first screen
  on the frame's load event. Tabs, budget links and the sub-view selectors switch screens. Dialogs
  and row panels open as overlays and close on Escape, Cancel, the close button or the backdrop.
  Save-like buttons say that nothing is saved, and links outside Budgets say that the file covers
  the Budget module only.
