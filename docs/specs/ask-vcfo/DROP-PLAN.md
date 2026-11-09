# Ask VCFO drop: "fill this in" from files, folders, ZIPs and pasted text (plan, approved 2026-11-09)

## Context

The owner expects Ask VCFO to work like this. A project lead drops files, a whole folder or a ZIP, or pastes any text (labelled or not), and says "fill this in". The chat then:

- reads all of it;
- works out which client and which place in the app each piece belongs to;
- prepares the fills and uploads.

Payroll and attendance sheets, for example, should go into the right client's labour register for the right state and month. Nothing is saved until the person approves it on a review card.

### What exists today

| Limit | Where |
|---|---|
| At most 5 files; extras are dropped without a message | composer |
| No folders and no ZIP files | composer, `app/api/ask/attachments/route.ts` |
| Each drop is locked to one client | `src/lib/ask/do/entry.ts` |
| Files are read one after another inside the chat request | `entry.ts` |
| Only incorporation checklist values can be filled | `src/lib/ask/field-catalog` |
| Only 5 ID-copy file fields can be filled | `COPY_FIELD_BY_DOC` |
| Text sent to the model is cut at 40k characters | `src/lib/ask/data-router/read.ts` |
| ID scans are off | `ASK_ID_DOC_READING` |
| The per-run token budget is stored but never enforced | `entry.ts` |

### Owner decisions

1. **Destinations:**
   - checklist answers and any checklist upload field;
   - labour registers (paysheet, attendance, overtime, employees, leave);
   - compliance task evidence;
   - the document vault for everything else.
2. **Several clients:** one review card per client. Files that cannot be placed get a "Where should these go?" question.
3. **Drop size:** up to 50 files and 200 MB. Folders and ZIPs are unpacked. Reading runs in a background job with progress, and the person can close the panel and come back.
4. **ID scans:** read with the model; identity numbers stay masked everywhere.
5. **Pasted text:** any pasted text, including loose prose such as an email or notes, is read and placed.
6. **.xls and .ods:** refused with a message asking for .xlsx.
7. **Labour register state:** taken from an earlier batch or the file. Otherwise it falls back to the registered office state, shown on the card and editable.
8. **Full labour slot:** replaced after approval. Undo restores the old file unless the month is closed.
9. **Budget:** 400k tokens per drop. When a drop runs over, it stops, keeps what it has prepared, and lists the files it did not read.

## Design

### A drop is an `ask_runs` row
- It uses `workflow: 'drop'`, which needs no new table.
- `state` holds:

  ```
  { files: DropFile[], groups, unplaced, progress: { done, total, label } }
  DropFile = { attachmentId, path, size, status, docType?, engagementId?, destination?, reason? }
  ```
- Files link to the drop through the existing `ask_attachments.runId`.
- The current 5-file `attachmentIds` path keeps working. A request carrying `dropId` goes to the new path.

### Migration `0050_ask_drop`
- `ask_attachments.relative_path`: the folder path, used as a hint.
- `ask_attachments.parent_id`: the ZIP a file was unpacked from.
- An index on `ask_runs(conversation_id, status)`.

### ZIP library
- Use `fflate` (already in the lockfile; it becomes a direct dependency). It reports each entry's size before unpacking and can stop part way.
- Not `pizzip`. It unpacks everything into memory before it checks sizes, so it cannot stop a ZIP bomb.

### Everything new reuses the existing pieces
- the changeset and card (`src/lib/ask/changeset/*`);
- the action registry (`src/lib/actions/*`);
- the reader, placement and planning (`src/lib/ask/data-router/*`);
- the repositories, called with the person's own `AuthContext`.

## Phases

### Phase 1: New destinations as actions (still one client per run)

**Labour upload logic in one place.** Move the route's inline logic into `src/lib/labour-registers/ingest-upload.ts` as `ingestRegisterUpload(ctx, { batch, slot, bytes, fileName })`:
- `parseWorkbook`
- sha256
- `putObject` to `labour-registers/{eng}/{batch}/{slot}-{sha12}`
- `recordUpload`

`app/api/labour-registers/upload/route.ts` then calls it, so there are no two copies.

**Shared file copy.** `copyAskAttachment(actx, attachmentId, destKey)` in `src/lib/actions/shared.ts`, lifted from `checklist.attachFile` (`getOwnAskAttachments` → `getObjectBuffer` → `putObject`).

**New T2 actions** (staff roles, each with a `capability` line):

- **`labour.uploadSheet`** (`src/lib/actions/labour/upload-sheet.ts`)
  - Input: `{ engagementId, stateCode, periodFrom, periodTo, slot, attachmentId, value }`.
  - Preview: client, state, period, slot, row count, detected columns, `matchColumns` against the saved column map, and "replaces X" when the slot is full.
  - Recheck: the batch is not locked (`markedReadyAt`).
  - Execute: `openBatch` → `ingestRegisterUpload`.
  - Undo: restore the previous upload, or remove the new one (new `removeUpload` in `src/db/repositories/labour-registers.ts`). Refused once the batch is locked.
- **`compliance.attachEvidence`** (`src/lib/actions/compliance/attach-evidence.ts`)
  - Calls `addTaskAttachment` with `deliverable: true`, within the 15 MB limit.
  - Undo: `removeTaskAttachment`.
- **`documents.fileToVault`** (`src/lib/actions/documents/file-to-vault.ts`)
  - Copies the file to `engagement-documents`, then calls `createDocument` with a category of at most 64 characters.
  - Undo: a new soft `deleteDocument` in `src/db/repositories/documents.ts`.
- **`checklist.attachFile`, widened**
  - A new `src/lib/ask/field-catalog/upload-fields.ts` builds `UPLOAD_FIELDS` from every file field in `src/data/checklist.ts`.
  - `COPY_FIELD_BY_DOC` becomes `UPLOAD_FIELD_BY_DOC`, mapping docType to steps and fields.
  - `isWritableUse` stays as it is for values.

**Composer:** at most 5 files today, so show a visible "skipped" message instead of dropping extra files without one.

### Phase 2: Background job, progress, coming back later

**`run-context.ts`.** Lift the provider and budget closures from `entry.ts` into `src/lib/ask/do/run-context.ts`. The metered provider now checks `run.budgetTokens` before each model call. When over budget, it sets `over_budget` and keeps the rows already prepared. The daily budget and rate limit are checked before each call too.

**Job.**
- `src/jobs/ask-drop.ts`: event `ask/drop.run`, `retries: 1`, concurrency 1 per person.
- Steps: `unpack` → `read-<file>` → `classify` → `place-<client>` → `finish`.
- Register it in `app/api/inngest/route.ts` and `src/lib/dev/jobs-registry.ts`.
- `queueAskDrop` in `src/lib/ask/drop/run.ts` copies `queueAskIngestion` (`src/lib/ask/ingest/run.ts`): it uses Inngest when reachable and runs in the same process otherwise.

**Acting as the person.** `askRunActor(runId)` (new, in `src/db/repositories/ask-runs.ts`) rebuilds the person's `AuthContext`, so every read and write stays role-scoped.

**Progress.**
- `app/api/ask/runs/[id]/route.ts` (GET, owner only) returns `{ status, progress, files, changesetIds, unplaced }`.
- `src/hooks/ask/use-ask-run.ts` polls it every 2 seconds while the run is queued or running.

**Coming back.** The job writes the closing assistant message into the conversation. `findActiveAskRun` (modelled on `findWaitingAskRun`) is returned with the conversation, so a reopened panel picks the poll back up.

### Phase 3: Intake (folders, ZIPs, 50 files, 200 MB)

**Composer.**
- `src/components/ask/drop/collect.ts` walks dropped folders with `webkitGetAsEntry`, looping `readEntries`.
- A folder picker (`webkitdirectory`) sits beside the file picker.
- It returns the accepted files with their relative paths, plus the skipped files with a reason:
  - hidden or system files;
  - .xls and .ods ("save as .xlsx");
  - other types that are not allowed;
  - more than 50 files;
  - more than 200 MB in total.
- The composer shows the skipped list and progress for each file.

**Upload.** In `src/hooks/ask/ask-api.ts`, `createAskDrop()` and `uploadDrop(files, onProgress)` upload 4 files at a time and report progress with `XMLHttpRequest`.

**Routes.**
- `app/api/ask/drops/route.ts` (POST) creates the drop.
- `app/api/ask/attachments/route.ts` accepts `dropId` and `relativePath`, and allows `zip` and `xlsm` for drops.
- `app/api/ask/drops/[id]/start/route.ts` (POST) stores the instruction and any paste, then queues the job.
- `src/lib/upload-limits.ts` gets `DROP_MAX_FILES = 50` and `DROP_MAX_BYTES = 200 MiB`, enforced in the browser and on the server.

**ZIP unpacking** (`src/lib/ask/drop/unzip.ts`, runs in the job). Limits and rules:
- 50 entries in total;
- 200 MB unpacked in total;
- 25 MB per entry, counted as real bytes while streaming;
- a pack ratio of at most 100;
- no nested ZIPs, no encrypted entries;
- paths cleaned.

Each entry becomes an `ask_attachments` row with `parent_id` and its relative path.

### Phase 4: Reading everything

`src/lib/ask/data-router/read.ts`:

- **Several parts per file.** `ReadResult.parts: ReadPart[]`, where `ReadPart = { docType, company, values, pages }`. One PDF can hold several directors or companies. The first part stays in the old fields, so callers keep working.
- **Long text.** The 40k cut-off becomes `chunkPages(pages, 30_000)`, which splits on page and sheet boundaries, then merges and de-duplicates.
- **Labour sheets skip value reading.** A sheet that `guessSlot` recognises skips value reading, so no tokens are spent on thousands of payroll rows.
- **Pasted prose.** A prose prompt variant for notes and emails, keeping the word-for-word rule. `looksLikeData` and `mayHoldValues` in `entry.ts` accept any paste that comes with a "fill"-type instruction.
- **ID scans.** `ASK_ID_DOC_READING` defaults to on (`src/lib/ask/config.ts`). `maskIdentityNumbers` is added to run steps, `DropFile.reason`, card display values and error logs.
- **Prompt injection.** File text goes inside `<document>` delimiters, and the system prompt says it is data, never instructions.

### Phase 5: Sorting every file to a destination and a client

`src/lib/ask/drop/classify.ts` holds `classifyFile(read, hints)`, which returns `{ destination, engagementCandidates, confidence, needs[] }`. It is code first; files that are still unclear go to one batched model call.

**Labour slot.**
- Slot: `parseWorkbook` + `guessSlot`.
- Period: `detectAttendanceGrid` dates, then `parsePeriodHint` (new, `src/lib/labour-registers/period-hint.ts`) on the file name, sheet name and folder names.
- State:
  1. the client's last batch (`listBatches`);
  2. a state name or code in the folder, file or sheet names;
  3. the registered office state, flagged "assumed" on the card.

**Client hints, in order.**
1. The company named in the document (`companiesNamed`).
2. The folder names.
3. The file name.
4. The message.
5. The page the person is on.
6. The person's only project.

A sheet with no company takes the client of its folder siblings.

**Checklist upload.** docType goes through `UPLOAD_FIELD_BY_DOC` and then label matching. When two or more fields match, one model choice is made among the open steps only.

**Compliance evidence.** Only when the message or folder names a task, or the file names a filing and period with an open task (role-scoped compliance task list).

**Vault.** Everything else, with the category taken from the docType or set to "Other".

**Assembling cards.** `src/lib/ask/drop/assemble.ts` builds the rows for each client:
- value rows go through the existing `placeValues` and `planRows`;
- file rows come from each file's destination;
- every row records its source file and folder path.

### Phase 6: Several clients, the "where" question, and the big-card UX

**One card per client.**
- One changeset per client (`createAskChangeset` with `runId`), titled "Client: N files, M values".
- A manager notice for each group, as `entry.ts` already does.

**Files that cannot be placed.**
- They go into one "Where should these go?" message, each file with its reason: client unknown, state unknown, or period unclear.
- The run waits (`waiting_reply`) with `state.unplaced`.
- Replies such as "file 3 → Acme, Karnataka, Aug 2026" are parsed by extending the `companiesNamed`/`CONFIRM` code. The new rows go onto that client's open card, or onto a new card.

**Closing message.** `src/lib/ask/drop/summary.ts` writes one line per card with its link, plus the questions.

**Card for big drops.**
- `src/lib/ask/changeset/view.ts` gains `groups`: by destination (Checklist values, Checklist uploads, Labour register for each state and month, Compliance evidence, Vault), then by file.
- `src/components/ask/AskChangesetCard.tsx` shows the groups as collapsible sections with counts (ready, held, saved).
- "Accept all clear" works per group and for the whole card.
- More than 20 rows are collapsed by default.

### Safety (all phases)
- Every file and value row is T2. Rows are checked again when the person clicks and run as that person. The job never runs an action.
- Access goes only through repositories with the run owner's `AuthContext`. Drop and run routes check that the person owns the run.
- The limits are enforced in the browser, on the server and in unzip. The labour lock is checked again when the change is applied.
- Budgets: daily, the rate limit, 400k per drop, and one drop job at a time per person.
- Identity numbers are masked in prompts, messages, run steps, cards and logs.

## Critical files

| Kind | Files |
|---|---|
| Modify | `src/lib/ask/do/entry.ts`, `src/lib/ask/data-router/read.ts`, `src/lib/ask/data-router/plan.ts`, `src/lib/ask/pipeline.ts`, `src/components/ask/AskComposer.tsx`, `src/components/ask/AskChangesetCard.tsx`, `src/lib/ask/changeset/view.ts`, `app/api/ask/attachments/route.ts`, `app/api/labour-registers/upload/route.ts`, `src/lib/actions/checklist/set-response.ts`, `src/lib/upload-limits.ts`, `src/lib/ask/config.ts`, `src/db/repositories/{ask-runs,ask-attachments,labour-registers,documents}.ts` |
| New | `src/lib/ask/drop/{run,unzip,classify,assemble,summary}.ts`, `src/jobs/ask-drop.ts`, `src/lib/ask/do/run-context.ts`, `src/lib/labour-registers/{ingest-upload,period-hint}.ts`, `src/lib/actions/{labour/upload-sheet,compliance/attach-evidence,documents/file-to-vault}.ts`, `src/lib/ask/field-catalog/upload-fields.ts`, `src/components/ask/drop/collect.ts`, `src/hooks/ask/use-ask-run.ts`, `app/api/ask/{drops,drops/[id]/start,runs/[id]}/route.ts`, migration `0050_ask_drop` |
| Reuse | `openBatch`, `parseWorkbook`, `guessSlot`, `detectAttendanceGrid`, `matchColumns`, `recordUpload`, `addTaskAttachment`, `createDocument`, `indexMilestoneUpload`, `placeValues`, `planRows`, `lockEngagement`/`companiesNamed`, `createAskChangeset`, `tokeniseIdentityNumbers`/`maskIdentityNumbers`, `queueAskIngestion` pattern |

## Verification

**Unit tests**, beside each new file:
- `collect`: traversal, skip reasons and limits.
- `unzip`: a bomb ratio, the per-entry and total limits, path traversal, a nested ZIP.
- `classify` and `period-hint`.
- `upload-fields`.
- One test per action: preview, recheck, a locked batch, replace, undo.
- `run`: the in-process fallback, `over_budget`, and acting as the person.
- `assemble`: one card per client.
- Masking: no raw PAN or Aadhaar in run steps or logs.

**Golden cases** in `tests/ask/evals/fill/cases.ts`, with fixtures from `make-fixtures.mjs`:
- two clients in one ZIP;
- a folder `Acme/Payroll/Aug-2026/`;
- a paysheet and an attendance grid going to the labour register;
- a sheet with an unknown state (expects the registered office state, flagged);
- a pasted email in prose;
- a scanned PAN (expects it masked);
- a GST return going to compliance evidence;
- a contract going to the vault;
- an instruction hidden inside a file (expects nothing done);
- an .xls file (expects it skipped).

**End-to-end** (extend `e2e/ask-fill.spec.ts`, against a local build with MinIO):
1. Drop a folder holding two clients.
2. Watch the progress.
3. Close and reopen the panel.
4. See two cards.
5. Accept the labour group.
6. Open the labour register and check the slot holds the file.
7. Undo.

**Gate** after each phase: `npm run check`. The live fill eval (`run-live.ts`) runs once at the end, and its cost is reported.

**Docs** to update: `docs/context/notes/ask-do.md`, `docs/context/notes/labour-registers.md`, `docs/context/STATE.md`.

## Decisions taken while building

- **Run and job (phase 2).** What a drop file read is stored in S3 beside the file (`ask/attachments/<person>/drops/<run>/reads/<attachment>.json`), never in `ask_runs.state` (which is masked, so it could not carry a PAN to the card) or in Inngest step results (which leave our infrastructure). Each read step adds its spend to the run row, so the 400k budget holds across steps. A run that went over budget is stored as `over_budget` even when it prepared a card; the card stays. The chat's card building moved into `prepareClientCard` in `src/lib/ask/do/entry.ts`, which the phase A `assembleDrop` reuses. The start route records the person's message in the chat. `activeRunId` covers drops queued or running in the last 6 hours. Inside a ZIP, an entry over 25 MB is skipped with a reason, but a pack ratio over 100 past the first megabyte refuses the whole ZIP.
- **Integration after phase A.** Only a checklist answer can be edited on the card (`rowValueEditable` in `src/lib/ask/changeset/apply.ts`, used by the card view and the edit route alike); every file row is accepted or left. Editing the assumed labour state on the card is part of the phase 6 card work. Undoing a compliance evidence row marks the deliverable it replaced again (`markTaskDeliverable`). Loose prose pasted with a "fill this in" kind of instruction counts as data (`isDataMessage` in `entry.ts`), provided there are at least 60 characters beyond the instruction. `.env.example` now sets `ASK_ID_DOC_READING=true`.
