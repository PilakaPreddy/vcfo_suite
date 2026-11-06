# Tooling, environment and local access

Gotchas already paid for once. Append when something costs more than a minute to figure out.

## Environment

- DB user is `vcfo`, not `postgres`. `docker exec vcfo-postgres psql -U vcfo -d vcfo`.
  Connecting as `postgres` fails with `role "postgres" does not exist`.
- Containers `vcfo-postgres` and `vcfo-minio` are already running; `npm run infra:up`
  is idempotent, so re-running is safe.

## Typecheck

- `export interface Foo = Partial<Bar>` is invalid — Next overlays
  `Expected '{', got 'interface'` and `tsc` reports `TS1005`. Use
  `export type Foo = Partial<Bar>`. That parse error in `AppContext.tsx`
  500s every page (providers import it).
- `app/api/_reference-supabase/` has been deleted (Phase 1d). Residual typecheck
  noise is from leftover Supabase stubs (`src/lib/supabase/*`) and missing
  `useInternPortfolio` — not from API routes.
- `_rewrite-from-supabase/` has been deleted; incorporation docs live under
  `src/lib/incorporation-docs/` (storage/share/preview-save).

## LAN / phone access

- Use `npm run dev:lan` (binds `0.0.0.0`) — plain `next dev` is localhost-only.
- Next 15+ blocks cross-origin `/_next/*` (HMR + JS chunks, not HTML/API) unless
  the browser Origin is in `allowedDevOrigins` (`next.config.mjs`). Symptom:
  page opens, login fields/toggles stay dead. LAN ranges are already listed.
- Cloudflare quick tunnels (`*.trycloudflare.com`) are a different origin than
  localhost:3000; the hostname also rotates every `cloudflared tunnel` run.
  Next 16 `isCsrfOriginAllowed` matches hostname only; `*.trycloudflare.com`
  (one label) and `**.trycloudflare.com` are in `next.config.mjs`. Verified
  against Next 16.3. For ngrok/other hosts set `DEV_TUNNEL_HOST` or
  `ALLOWED_DEV_ORIGINS` and **restart** `npm run dev:lan` (`next.config` is
  read at boot). Confirm in DevTools Network: `/_next/static/chunks/*` is
  **200**, not **403** (`Unauthorized` body = origin still blocked).
- **Leave `AUTH_URL` unset** (`AUTH_TRUST_HOST=true`). Auth.js `reqWithEnvURL`
  rewrites the request origin to `AUTH_URL` when it is set, so pinning
  `http://localhost:3000` or a previous trycloudflare hostname breaks login
  on the host you actually opened. Same for `NEXT_PUBLIC_SITE_URL` (emails /
  Outlook callback). Do not paste the rotating tunnel URL into `.env.local`.
- HMR (`/_next/hmr` websocket) may still warn or disconnect through Cloudflare
  even when pages work. Dismiss the overlay; chunks 200 means React hydrated.

## Dead-code hygiene (2026-09-13)

- `npx knip --reporter compact` is the reference dead-code scan. Expected residue: `src/test/server-only-stub.ts` (vitest alias, not an import). Anything else it reports is new dead code.
- Never add keep-alive "registry" files that import unused modules to silence tooling; they hid ~60 dead files.
- `src/lib/storage.ts` (localStorage `read`/`persist` no-op stubs) is gone. Persisted state goes through repositories + TanStack Query only.
- Auth guards: import from `@/auth/guards` directly (`requireAnyRole('admin', 'manager')`, `requireRole('client')`). The `@/lib/api/require-role` / `require-manager` shims were deleted.
- Email: import `sendEmail` / `SendEmailResult` from `@/lib/email/send-email`. `sendResendEmail`, `SendResendResult`, `resolveResendDevRedirect` no longer exist.
- Upload limit constant is `MAX_UPLOAD_BYTES` (`@/lib/upload-limits`).

## Dev servers in a git worktree

`npm run dev` runs `docker compose up` first, which fails in a worktree, because the container names belong to the
main checkout's project. It also leaves an empty network and volumes named after the worktree folder. Run
`npm run css:portal && npx next dev -p <port>` instead, against the worktree's own `DATABASE_URL`.

## Browser tests on a worktree

- Set `PLAYWRIGHT_BASE_URL` to the worktree's port. The login helper clears the sign-in counts first when `DATABASE_URL` points at localhost, because the limit counts every attempt and a second run in fifteen minutes would otherwise be locked out.
- Vault and Documents ask for real files, so a page fails with a 500 when MinIO is down and a 404 when the bucket has no demo placeholders. `npm run db:seed-demo` writes the placeholders only if storage is reachable at that moment.
- The receivables spec needs `npm run receivables:seed-demo` on the same database.
