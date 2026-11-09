# Ask VCFO: paste and file

Gotchas already paid for once. Append when something costs more than a minute to figure out. The design is in
`docs/specs/ask-vcfo/MASTER-PLAN.txt` and `BUILD-PLAN.md`, phase 4.

## How a file or a paste becomes a card

- `src/lib/ask/do/entry.ts` is the fixed workflow: read, lock the client, place values, plan rows, save the card. There
  is no agent loop. `data-router/place.ts` is shared with the golden set, so the eval runs the code production runs.
- The cheapest step goes first. A form, labelled lines and a table are read by code with no model. The model reads only
  prose and picks only from catalog candidates, and code checks what it picked. Identity numbers are tokenised before
  the model sees text, and a value from text must appear verbatim in it.
- With `ASK_ID_DOC_READING` off, an image or a scan is refused before any model call, and so is text naming an identity
  document. Typed pastes still work, masked.
- The company comes from the message, then the page, then the only project, then the document. A named company out of
  reach reads nothing and never falls back to the page. A document naming another company asks; "Yes, file it for X"
  answers. The waiting state is an `ask_runs` row with status `waiting_reply`.
- A company name only identifies the client, except on a certificate of incorporation.

## How a plain request becomes a card (actions)

- A `do_work` request with no file goes to `src/lib/ask/do/pick-action.ts` first. One small structured-output call reads
  it into plain fields (action, company, step, title, status, date, note, subject, body). Code then finds the client
  with `lockEngagement` inside the person's scope, the step with `resolveStep`, and parses the action's own zod input.
  The model never sees an id and can only name an action `pickableActions` offered for that role. `none` falls through
  to the data router, which still owns filling checklist answers.
- Actions live in `src/lib/actions/<area>/index.ts` with a `capability` line; "What can you do?" is built from those
  lines (`src/lib/ask/capabilities.ts`), so the list and the chat never disagree. An action without `capability` works
  but is not listed.
- T2 (`tasks.create`, `statuses.setStep`) and T3 (`requests.create`, `reminders.client`) go on the same card as a fill.
  T3 cards carry `recipients`, shown as "Goes to … once you accept". T1 (`reminders.draftEmail`) runs at once and only
  returns a compose link; it sends nothing. T4 is never registered.
- Each action calls the code its screen calls: `createTask`, `applyChecklistPatch`, `createDocumentRequest` plus
  `notifyEngagementEventSoon`, `sendClientReminder`. Outward actions have no undo because the email has gone; a task's
  undo marks it not applicable, and a status undo only runs if nobody changed the status since.
- A reminder with no step named goes to the step waiting on the client now. The 24-hour limit is checked again at the
  click, so a card prepared twice cannot send twice.

## Rows and approval

- `gate`, `owner` and `condition` hold a row. `format`, `answer` and `validator` wait for an edit. `conflict`,
  `other_step` and `documents_differ` allow Accept, but "Accept all clear rows" leaves them for their own click.
- A row whose condition parent is empty gets a question row first. Answering it rechecks in order and releases its
  children, so a resident question can free the PAN row below it.
- The approval is an atomic claim on status, hash and expiry. Every row is checked again at the click by
  `src/lib/actions/checklist/rules.ts`, and it writes through `checklistPatchForRole`, the same code the screen uses.
- The field catalog is generated: run `npm run ask:catalog` after changing a source, or `catalog.test.ts` fails.

## How a drop becomes cards (folders, ZIPs, up to 50 files)

The plan and its decisions are in `docs/specs/ask-vcfo/DROP-PLAN.md`.

- A drop is an `ask_runs` row with `workflow: 'drop'`; its `state` is a `DropState` (`src/lib/ask/drop/types.ts`). The
  composer creates it (`POST /api/ask/drops`), uploads four files at a time with `dropId` and `relativePath`, then
  starts it (`POST /api/ask/drops/:id/start`). Five files or fewer with no folder still take the old chat path.
- The job is `src/jobs/ask-drop.ts` (event `ask/drop.run`, one drop at a time per person) with four steps from
  `src/lib/ask/drop/run.ts`: unpack, read each file, sort, finish. `queueAskDrop` runs the same steps in this process
  when Inngest is not reachable, so local dev needs no Inngest. Every step rebuilds the owner's `AuthContext` with
  `askRunActor`, so the job reaches only what the person could.
- What a file read is lives in S3 beside the file (`.../drops/<run>/reads/<attachment>.json`), never in the run row or
  an Inngest step result. The run row is masked, so it could not carry a PAN to the card anyway.
- Sorting is code first (`classify.ts`), then `assemble.ts` with the person's repositories. The client comes from the
  company the document names, then the folders (deepest first), the file name, the folder's siblings, the message,
  the page and the person's only project. The state of a labour register: a reply, then a state or city in the names
  (flagged `stateNew`, "new for this client: please check", when the client has filed only in other states), then the
  client's latest batch, then the registered office, which is flagged `stateAssumed` and shown as "(assumed from the
  registered office)". The state can be changed on the card ("Edit" offers the states; `rowStateEditable`).
- Every file row is the action's own `preview`, so the card shows what the action will do. A row's `attachmentId` and
  a compliance `taskId` must be UUIDs, or the action's input refuses the row and the file is left out with "I could not
  prepare this file for the card". That cost a while in the golden test.
- One card per client, titled "Client: N files, M values". Files that cannot be placed go into one "Where should these
  go?" message and the run waits in `waiting_reply`, even when it made cards. `parseDropReply` reads the answer, and its
  rows go onto that client's open card (`appendAskChangesetRows`) or a new one.
- `.xls` and `.ods` are refused before reading with "save it as .xlsx" (`dropFileRefusal`). A ZIP is unpacked with
  `fflate` inside the job: 50 entries, 200 MB, 25 MB per entry, a pack ratio of 100, no nested or encrypted entries.
- The 400k token budget is checked before every model call (`run-context.ts`). Over it, the drop stops, keeps its cards
  and lists the files it did not read or sort; the run is stored as `over_budget`.
- A labour sheet (`isLabourSheet`) is never read as values and costs no tokens. The month comes from the attendance
  grid's dates, then the file and folder names (`parsePeriodHint`); sheet names are not used.

## Testing it

- `npm run eval:fill:live` runs the golden set on the real model. Keep every document in `tests/ask/evals/fill/fixtures`
  synthetic, and regenerate them with `make-fixtures.mjs`.
- `e2e/ask-fill.spec.ts` needs S3 or MinIO, because an upload goes through storage. In a worktree, start a MinIO of your
  own and set `S3_ENDPOINT` on the server, not in `.env.local`.
- On demo data every `pre-15` is done or locked, so the spec removes that slice from Kestrel and restores it afterwards.
  A run killed half-way leaves it removed, and running the spec again does not bring it back: run
  `npm run db:seed-demo`.
- A composer ignores typing until it hydrates. Retrying "type and click Send" sends the message twice, so retry the
  typing and click once.
- `next dev` stopped twice during these runs with exit code 143, right after compiling a changeset route. Run the spec
  against a build with `next start`. Playwright otherwise tries `npm run dev`, which runs Docker Compose from the
  worktree and hits the main checkout's container names.
- The drop's golden set (`DROP_CASES` in `tests/ask/evals/fill/cases.ts`) runs the whole drop job in
  `drop-golden.test.ts`, with repositories, storage and the model in memory and the real reader, sorting, data router
  and action previews. Its fixtures are the `drop-*` files; `make-fixtures.mjs` now writes only missing files unless
  given `--force`, and takes `CHROMIUM_PATH` when the installed Chromium is not the version Playwright expects.
- The drop's end-to-end test (last in `e2e/ask-fill.spec.ts`) drops a folder for Kestrel and Solstice through the
  folder picker (`ask-folder-input`), so it needs a Playwright that uploads directories (1.46 or later). It names the
  state in the folder, because the demo data has no labour batch and may have no registered office state. It deletes
  the August batches it opened.
