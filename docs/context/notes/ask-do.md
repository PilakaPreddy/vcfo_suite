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
