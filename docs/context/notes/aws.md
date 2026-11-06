# AWS deploy and WhatsApp (End User Messaging)

Gotchas already paid for once. Append when something costs more than a minute to figure out.

## AWS deploy gotchas (2026-09-11)

- **`aws login` sessions are invisible to Terraform.** The CLI's browser login
  writes a `login_session` the Go SDK cannot read. `eval "$(aws configure
  export-credentials --profile vcfo --format env)"` immediately before every
  terraform command; the exported token expires in ~20 min, so a long apply
  started on a stale export dies mid-run (leaves `errored.tfstate` + a held
  S3 lock — `terraform force-unlock <id>` with the id from the `.tflock` object).
- **App Runner injects `HOSTNAME=<instance>`**, overriding the Dockerfile ENV.
  Next standalone binds to it and the health check never reaches port 3000
  (`CREATE_FAILED`). The CMD forces `HOSTNAME=0.0.0.0` at exec time. A
  `CREATE_FAILED` service cannot be redeployed — delete + recreate, and the
  service URL changes.
- **`pg` >= 8.16 treats `sslmode=require` as verify-full.** RDS chains to
  Amazon's private CA, so without `NODE_EXTRA_CA_CERTS=certs/rds-global-bundle.pem`
  every connection fails "self-signed certificate in certificate chain" — an
  explicit `ssl: { rejectUnauthorized: false }` does NOT override the URL.
  Applies to laptop `db:migrate` too.
- `npm ci` needs `legacy-peer-deps=true` (`.npmrc`) — eslint 10 vs
  eslint-plugin-jsx-a11y peer range. `drizzle-kit` had to move 0.18.1 → 0.31.x:
  the old one had no `defineConfig`, which only `next build` typechecks.
- `terraform -exclude` does not exist in 1.13; bootstrap order uses `-target`
  for everything except the App Runner service (needs an image first).
- `NEXT_PUBLIC_SITE_URL` is baked at build; server-side links read runtime
  `SITE_URL` first (`src/lib/site-url.ts`), so one image serves any hostname.

## WhatsApp — AWS EUM only (2026-09-08, collapsed 2026-09-16)

- One transport: `sendWhatsAppTemplate` (dispatcher, runs the guards) →
  `sendViaEum` in `send-whatsapp-eum.ts`, shared result/deps types in
  `send-whatsapp-shared.ts`. The Twilio transport, its two webhooks, the
  `WHATSAPP_PROVIDER` switch and the `twilio` dependency were removed on
  2026-09-16. Do not reintroduce a
  provider field "just in case".
- **The guards run once, in the dispatcher.** `resolveWhatsAppChannel` is pure
  and returns the approved Meta template name as `templateRef`; it lands in
  the text `template_sid` column (name kept, option A). Guard order is
  load-bearing: `disabled → no_template → no_phone → no_consent → opted_out`.
- **Meta wants bare digits.** `toMetaPhone` strips `+` for the EUM payload;
  `fromMetaPhone` adds the `+` back when a webhook reports a number, because
  profiles are keyed by E.164.
- **EUM template names default to the event name**, so the path needs no
  per-event env at all — approve the six templates in WhatsApp Manager under
  `welcome`, `coi_issued`, … Overrides use `WHATSAPP_TEMPLATE_NAME_<EVENT>`.
- **EUM needs no credentials in config** — it authenticates through the App
  Runner / ECS instance role like `sendViaSes`, so `isWhatsAppConfigured`
  checks only `WHATSAPP_ENABLED` and `EUM_PHONE_NUMBER_ID`.
- **Retries:** `isRetryableWhatsAppError(code)` is the EUM classifier. Unknown
  codes stay retryable — a misclassified outage costs three attempts, a
  misclassified permanent error silently drops a real notice. Classifies on
  the SDK exception name (`ValidationException`, …) and on Meta's numeric
  codes.
- **The SNS webhook is the authentication.** `/api/webhooks/aws-eum` is public;
  `aws-sns-verify.ts` rebuilds the canonical string per message type, refuses
  any signing certificate that is not HTTPS on `sns.<region>.amazonaws.com`,
  and verifies RSA-SHA1/SHA256 per `SignatureVersion`. Set
  `AWS_EUM_SNS_TOPIC_ARN` to pin the topic: a valid signature proves the
  message came from SNS, not from *our* topic.
- The SNS `Message` holds `whatsAppWebhookEntry` as a JSON string *inside* the
  JSON body — parse twice. `eum-events.ts` is pure and tolerates both nesting
  forms; an unparseable event is acknowledged with 200, never a 500 (SNS would
  just retry a payload that can never parse).
- **Outbound-only still.** The parser returns the sender and an opt-out verdict
  and nothing else — no inbound body crosses that boundary, is logged, or is
  stored.
- `@aws-sdk/client-socialmessaging` had to be installed with
  `--legacy-peer-deps`: the repo has a pre-existing
  `eslint-plugin-jsx-a11y` / `eslint@10` peer conflict that blocks any plain
  `npm install`.

## WhatsApp — out-of-band setup (owner; the code is inert until this is done)

Carried over from the removed `AWS-EUM-WHATSAPP-PLAN.md` §6, updated for the
single EUM transport (there is no `WHATSAPP_PROVIDER` any more).

1. Under the existing verified Meta Business portfolio, create or attach the
   **transactional WABA + phone number**, separate from the DoubleTick number.
2. In the AWS End User Messaging (Social) console, link that WABA and register
   the number, then copy the **origination phone number id** into
   `EUM_PHONE_NUMBER_ID`.
3. Get the six templates approved in WhatsApp Manager under names matching
   `NOTIFY_EVENTS` (`welcome`, `coi_issued`, `document_delivered`,
   `compliance_due_monthly`, `compliance_due_quarterly`, `compliance_overdue`),
   category **utility**, language `en`. Body variable order must match the
   template definitions in `src/lib/notify/`.
4. Create the **SNS topic** EUM publishes to; subscribe the HTTPS endpoint
   `…/api/webhooks/aws-eum`; the route confirms the subscription itself once
   deployed. Set `AWS_EUM_SNS_TOPIC_ARN` to pin the topic.
5. Attach an IAM policy allowing `social-messaging:SendWhatsAppMessage` to the
   App Runner role. No static keys.
6. Confirm EUM Social is available in the chosen region
   (`SOCIAL_MESSAGING_REGION`, falling back to `AWS_REGION`), then set
   `WHATSAPP_ENABLED=true`.

Until the number is registered and `EUM_PHONE_NUMBER_ID` is set, every send is
recorded as `skipped/disabled` and no AWS call is made. Templates are `en`
only (`WHATSAPP_TEMPLATE_LANG`).

## pgvector on RDS (2026-11-06)

- Migration `0047_ask_foundation` starts with `CREATE EXTENSION IF NOT EXISTS vector`. The migrating
  user needs `rds_superuser` (the RDS master user has it) and the instance must offer the extension:
  check `SELECT * FROM pg_available_extensions WHERE name = 'vector'` before the deploy. AWS documents
  pgvector on RDS for PostgreSQL 16, but the exact version depends on the minor release.
- There is no vector index yet. Search filters by access and compares directly; add HNSW only past
  roughly 50,000 rows, and expect to size up from db.t4g.micro then.
- Embeddings use Titan Text Embeddings V2 through Bedrock. Until `ASK_EMBEDDINGS_PROVIDER=bedrock`
  and `ASK_EMBEDDINGS_REGION` are set, and the App Runner role may call `bedrock:InvokeModel` on it,
  vectors stay empty and search runs on full-text alone.
