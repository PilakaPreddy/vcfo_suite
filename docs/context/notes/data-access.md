# Data model, access control and repositories

Gotchas already paid for once. Append when something costs more than a minute to figure out.

## Four-role scoping

- `admin` = firm-wide (old manager unrestricted). `manager` = rows where
  `engagements.manager_id = ctx.userId`, with legacy fallback
  `manager_id IS NULL AND admin_id = ctx.userId`.
- Creating a project as admin requires `managerId` in the POST body; as
  manager, `managerId` is forced to `ctx.userId` and `adminId` stays null.
- Prefer `requireAdminOrManager()` for firm ops (create project, interns,
  KB write/delete, welcome email). Reserve `requireAdmin()`
  for create/list managers APIs.
- Audit log is Path A in `listAuditEvents`, not original intern-none RLS.
  Intern (Project Lead): own actor rows always, plus events on assigned
  engagements (`intern_id` + `engagement_leads`). Manager: only those
  engagement ids (`manager_id` + `engagement_managers` + legacy) — not own
  actor on someone else’s client, not unscoped admin noise. Admin /
  super_admin stay firm-wide. Interns read `GET /api/audit-logs`
  (`requireAuth`); `/api/admin/audit-logs` stays admin/manager.
- Cross-role URLs bounce via middleware segment check — use `staffBase` /
  `adminProjectPath(eng, roleOrBase)`, not hardcoded `/app/manager`.
  Super Admin has no `/app/super/projects/*` — `staffProjectBase` / `staffNewProjectPath`
  map super → `/app/admin`. Prefer `staffProjectBaseFromPathname` so Super in a
  manager shell stays on `/app/manager/projects`.
- Create-project intern picker must not default to mock `tm1`. That id is not in
  the live roster, so Radix Select gets a value with no item and POST sends
  `Invalid internId`. Reconcile against `/api/admin/interns` (`intern_id` keys —
  seed may be `intern-1`, UI-created leads are `i` + 10 hex chars). Duplicate
  `intern_id` values on two profiles also break Radix (same Select value twice);
  `listInternOptions` uniques by that key. Admin POST still requires a real
  `managerId`.
- `parseJsonBody` now returns the first Zod issue message (e.g. `intern_required`)
  instead of a generic `invalid_body`, so create-project toasts can show the real
  reason. Welcome email failures after insert are caught so the 201 still returns.
- `LazyMotion strict` in `app/providers.tsx` throws if a page renders `motion.*`
  instead of `m.*`. Create-project’s phase rail (`CreateProjectPhasePath`) must
  import `m as motion` or the error boundary replaces the whole form.
- Guard narrowing: use `if (guard.ok === false)` so TS sees `error`/`status`.

## Multi-client + Super Admin

- Membership table: `engagement_clients` (owner/member). Primary still on
  `engagements.client_user_id` for legacy. SQL:
  `scripts/sql/20260810_multi_client_super_admin.sql`.
- Clients invite peers via `POST /api/engagements/:id/clients` and
  `/app/client/team`. Audited as `client.invite`.
- Clients substitute (self or peer) via
  `POST /api/engagements/:id/clients/substitute` — swaps membership, moves
  primary when replacing owner, welcome email for new accounts, audit
  `client.substitute`. Self-substitute signs the actor out of the portal.
- Client audit: `/app/client/audit` uses scoped `GET /api/audit-logs`.
- `super_admin` may enter every `/app/*` segment (middleware). Home:
  `/app/super/dashboard`. Seed: `super@vcfo.local` / `super123`.

- Browser POSTs multipart to `/api/engagements/:id/milestone-documents`
  (fieldId + file). Server auth + `assertEngagementAccess`, then S3/MinIO under
  prefix `milestone-documents/`.
- Downloads use `/api/milestone-documents/signed-url?path=…` (role-scoped).
- A 404 on upload almost always meant these routes were missing — they must stay
  in sync with `src/lib/documents/milestone-document-storage.ts`.

## Project management: edit, delete, and manager change requests

- **Soft delete only.** `DELETE /api/engagements/:id` sets `engagements.deleted_at`;
  nothing is destroyed. Every repository scope already filters on it
  (`scopeFor()` in `engagements/scope.ts`), so one write hides the project from staff
  lists, the client portal, and direct GETs at once. `POST /api/engagements/:id/restore`
  clears it. `GET /api/admin/projects/deleted` is the recycle bin
  (`/app/admin/projects/recycle-bin`). All three are firm-admin only.
- **The engagement PATCH now covers every field the create form collects** —
  companyType, parentEntityName/Address/RegistrationNumber, subsidiaryLegalName/
  RegisteredAddress and clientName joined the existing set. `EditProjectDialog`
  sends only the fields that actually changed.
- **Who may do what lives in `src/lib/projects/project-edit-policy.ts`** — a pure,
  unit-tested table. Admins act directly on everything. A manager edits the
  low-risk fields of their own projects directly but must file a change request
  for the three high-risk actions: delete the project, change the client,
  reassign the project manager. That last one matches the pre-existing
  `manager_reassign_admin_only` guard in the PATCH route. The policy module
  drives the UI; the API routes remain the enforcement point.
- **Approving a change request APPLIES it.** The manager's proposed values are
  stored on the row (`payload`) together with a frozen before/after (`preview`).
  `applyChangeRequest()` in `src/lib/projects/project-change-requests.ts` re-validates the
  payload and executes it under the APPROVING ADMIN's context — that is what lets
  a manager's delete or PM reassignment succeed at all. If execution throws, the
  request is re-opened rather than left claiming a change that never happened.
  Decisions are guarded on `status = 'pending'`, so two admins racing get one
  winner and one `already_decided`.
- Pending requests render in `ProjectChangeRequestsPanel`, mounted on the
  existing Approvals page for both scopes: admins decide, managers withdraw.
- The kebab is `ProjectActionsMenu` (projects list, board cards, firm panel, and
  the project detail header). Its manager/lead entries and their assignment-email
  toasts are the original behaviour — Edit details, Change client, and Delete
  project were added around them. Entries a manager can only request are labelled
  "(needs approval)" rather than hidden, so the path is discoverable.
- Migration `0014` was hand-trimmed: drizzle-kit emitted a large drift backlog for
  tables that already exist in the database. Only `engagement_change_requests`
  remains in the SQL; the snapshot is intact so future diffs are correct.

## Knowledge Bank folders

- Nested folders live in `knowledge_bank_folders` (`parent_id` null = root). Files
  use nullable `folder_id`. Migration `0013_knowledge_bank_folders.sql`.
- Delete **refuses non-empty** folders (child folders or files). FKs are
  `ON DELETE restrict` — no cascade. Empty the folder first.
- Path A: admin/manager write+delete; intern read all + insert own; intern cannot
  delete files or folders; client none. List DTO includes `folderPath` for
  CommandPalette / global filename search.
- GET `/api/knowledge-bank` returns `{ files, folders, tree }`. Optional
  `?folderId=` (or `root`) adds `{ current: { folder, ancestors, folders, files } }`.
  Create: `POST /api/knowledge-bank/folders`. Delete empty:
  `DELETE /api/knowledge-bank/folders/:id`.

## Profile avatars

- `profiles.avatar_object_key` (migration `0011_profile_avatar`) stores the S3
  key `avatars/{userId}/photo`. Run `npm run db:migrate` after pull. Bytes go
  through MinIO/S3 like other uploads; the client only loads
  `/api/account/avatar` (own photo, Auth.js cookie). Outlook copy is
  `POST /api/account/avatar/outlook` using the existing Graph token
  (`User.Read` already on `OUTLOOK_SCOPES`) — not an Auth.js login. Upload
  overwrites Outlook and vice versa; last write wins.

## Phase 2 mapping

- Task DB `open|in-progress|done` ↔ app `not-started|in-progress|completed` (other
  StatusCodes write as `open` on the way in).
- Doc request `fulfilled→uploaded`, `cancelled→rejected`; `approved` stored as plain text.
- Notification extras (`kind`, `href`, …) JSON-encoded in `notifications.description`.

## Runtime performance (2026-08-25)

- `listEngagements` does not select `checklist_state`. Tasks/requests/activity/invites/audit
  scope via `listScopedEngagementIds` (id-only). The jsonb blob is the expensive part of
  every previously duplicated list call on boot.
- Intern Today / dashboards hydrate status from `GET /api/checklist-index` (answers stripped
  in SQL). Step pages and vault still load full `/checklist` per engagement. Do not put
  `refetchInterval` on the fat list. Live popups stay on 4s `?head=1`.
- Command palette mounts the cmdk result list only while open. Compose-email host is
  dynamically imported from providers.

## Subqueries in a one-table select

Drizzle prints a column inside a `sql` field with no table name when the select reads one table. So `${inner.parentId} = ${outer.id}` becomes `parent_id = id`, the subquery compares its own columns, and it returns nothing with no error. A mocked repository test cannot see this. Write such a subquery with plain table names and an alias, as `listOwnAskConversations` does.
