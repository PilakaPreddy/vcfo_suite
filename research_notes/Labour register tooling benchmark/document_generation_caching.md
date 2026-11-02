# Generating, caching, versioning and auditing statutory documents in compliance SaaS (Nov 2026)

Scope note for the report writer: the target feature generates statutory labour register files (Excel/PDF) from
payroll inputs on a Node/TypeScript + Postgres + S3 + job-queue stack, must never regenerate the same artifact
twice, and must survive a labour-department inspection as evidence. Research below is organised by the
assignment's key questions. Two access problems limited sourcing and are flagged in Gaps:
`docs.aws.amazon.com` does not resolve from this session's network (so AWS S3 Object Lock and S3 pricing pages
could only be reached via search summaries and third-party mirrors), and several vendor-specific questions
(Avalara, Gusto, ADP, Vertex, Stripe Tax) returned no primary documentation at all.

---

## Caching and idempotency: how production systems key a generated artifact

### Takeaway
The defensible pattern is a content-addressed key — a hash over the full semantic input set *including*
template version, generator code version, locale and timezone — stored as a unique index in Postgres pointing at
one immutable S3 object; Stripe's idempotency-key model adds the second half of the story, which is storing the
*response* (including failures) against the key and rejecting a reused key whose parameters differ.

### Cited Findings
- Stripe saves the resulting status code and body of the first request for a given idempotency key, regardless of
  whether it succeeded or failed, and retries return the same stored result including 500s — [Stripe, Idempotent requests](https://docs.stripe.com/api/idempotent_requests?lang=curl)
- Stripe's idempotency layer compares incoming parameters against the original request's parameters and errors if
  they are not the same, specifically to prevent accidental misuse (the "request fingerprint" idea) — [Stripe, Idempotent requests](https://docs.stripe.com/api/idempotent_requests?lang=curl)
- On Stripe API v1, keys may be removed once they are at least 24 hours old, and a key reused after pruning
  generates a *new* request — i.e. Stripe's idempotency window is bounded, not permanent — [Stripe, Idempotent requests](https://docs.stripe.com/api/idempotent_requests?lang=php)
- On Stripe API v2 the semantics differ: retries do not repeat successful operations; Stripe retries failed or
  partially failed work to completion and returns an updated response — [Stripe, Idempotent requests](https://docs.stripe.com/api/idempotent_requests?lang=curl)
- A secondary source (http.dev) states Stripe answers a reused key carrying different parameters with HTTP 400;
  this is not confirmed by the Stripe pages above, which only say it "errors" — [http.dev, Idempotency-Key](https://http.dev/idempotency-key); treat the specific status code as unverified
- Single-flight in process memory is not enough on a fleet: "a per key lock in process memory works beautifully on
  a single instance, but breaks across a fleet", since each instance holds its own lock — [engineered.at, Request coalescing in Go](https://engineered.at/articles/solving-thundering-herds-with-request-coalescing-in-go)
- The Go request-coalescing pattern is described as a concurrent map from cache key to a shared "in-progress"
  signal, so later callers attach to the in-flight computation rather than starting their own — [engineered.at](https://engineered.at/articles/solving-thundering-herds-with-request-coalescing-in-go)
- Postgres advisory locks come in two scopes: session-level locks held until the connection closes, and
  transaction-level locks released at end of transaction; locks are connection-dependent, so an unexpected
  connection drop releases the lock — [Distributed locking with PostgreSQL](https://javabulletin.substack.com/p/distributed-locking-with-postgresql)
- Redis-based single-flight is the more common distributed form: acquire with `SET` plus `NX` and `PX`, and never
  release with a bare `DEL`, because that risks deleting another client's lock if yours already expired — [antirez/Redis, Cache stampede prevention](https://redis.antirez.com/fundamental/cache-stampede-prevention.html)
- Stale-while-revalidate and probabilistic early refresh avoid blocking readers entirely: a single request
  refreshes the cache moments before expiry while others keep serving the cached value — [antirez/Redis, Cache stampede prevention](https://redis.antirez.com/fundamental/cache-stampede-prevention.html)
- Cache stampede is described as the failure mode where one expired key takes down the backing database, because
  every concurrent reader misses simultaneously and recomputes — [Cache stampedes](https://codemia.io/archive/cache-stampede-prevention)

### Inferences
- The two mechanisms answer different questions and both are needed. A **content hash** answers "is this byte-identical
  output already on disk?" and is the cost control. An **idempotency key** answers "is this *request* a duplicate?"
  and is the correctness control for the write path (two clicks must not create two register rows, two audit entries
  or two signature requests). Keying only on content loses the request-level record; keying only on the request
  regenerates identical bytes whenever the key is new.
- The key should be a hash over a canonically serialised input bundle. From the stated requirements and the
  "classic mistakes" framing in the assignment, the input set for a labour register is at minimum: tenant/
  establishment id, register form id, period (and the period's timezone-resolved boundaries), the payroll input
  rows and their own row versions, the field-mapping/config version, the template file version, the generator
  code version, the output format, and locale/number-format/financial-year conventions. Canonicalisation matters
  more than the hash function: sort keys, pin float formatting, normalise dates to ISO-8601 with an explicit
  `Asia/Kolkata` offset, and version the serialiser itself (`v1:` prefix on the key) so a serialiser change does
  not silently collide with old keys.
- Classic omissions that produce wrong-but-cached output, consistent with the sources above: template version
  (fixed template bug never propagates), generator/code version (same), timezone (a register for "March" built in
  UTC clips 29–31 March IST entries), locale (lakh/crore grouping, DD/MM vs MM/DD), and the *assumption set*
  (e.g. "attendance assumed full") which is a semantic input even though it is not a payroll row.
- Practical stack mapping: a `generated_documents` table with `UNIQUE (content_key)` plus a status enum
  (`pending|building|ready|failed`) gives single-flight for free on Postgres — the worker does
  `INSERT ... ON CONFLICT (content_key) DO NOTHING RETURNING id`; the winner builds, the losers poll or subscribe.
  This is more robust than an advisory lock because the row survives the connection drop that the Spring Boot
  source warns releases advisory locks. Use `pg_try_advisory_xact_lock` only as a secondary guard inside the
  build transaction.
- ETag/`If-None-Match` is the right HTTP layer on top, not the storage layer: when the artifact is
  content-addressed, the ETag *is* the content hash, so the download route can answer `304` cheaply and
  `Cache-Control: immutable` is literally true. S3 already returns an ETag per object, but S3 ETags are only
  MD5 for single-part non-encrypted uploads, so compute and store your own hash rather than relying on S3's.

### Gaps
- Could not reach Stripe's engineering blog post on idempotency (only the API reference), so the internal
  implementation details (lock duration, storage) are unsourced.
- No primary source found for a named compliance product's content-addressing scheme; nothing in results
  confirms how any specific payroll/tax SaaS computes its artifact keys.
- AWS architecture-blog material on content-addressed storage was not retrievable (`docs.aws.amazon.com` and the
  AWS blog did not surface in results).

---

## Template/code versioning in the key: stale output vs immutable filed documents

### Takeaway
No source in this research describes a canonical published pattern for this tension; the material that exists
points at the e-invoicing analogue, where a filed artifact is never mutated and a correction becomes a *new*
document with a *new* identifier, and the old one is cancelled or voided rather than overwritten.

### Cited Findings
- Zoho Books treats a filed e-invoice as immutable: once cancelled, the status becomes Void and "the action can't
  be reverted", because the IRN is a unique identifier generated from the invoice number; the documented
  workaround is to clone the cancelled e-invoice and create a new one to push to the IRP — [Zoho Books, Undoing cancellation for e-invoice](https://www.zoho.com/in/books/kb/e-invoicing/undoing-cancellation-for-einvoice.md)
- Reusing an identifier is blocked, not patched: if an invoice was pushed to the IRP, cancelled there and deleted
  in Zoho Books, recreating it with the same number triggers an error and a different number must be used — [Zoho Books, IRN generated/cancelled](https://www.zoho.com/in/books/kb/e-invoicing/irn-generated-cancelled.md)
- A third-party integration guide states that Zoho and Tally "typically use versioning and exception journals",
  and that the sync should prevent modifications after IRN generation — [Ai Accountant, e-invoice IRN/QR integration guide](https://www.aiaccountant.com/blog/einvoice-irn-qr-integration-guide); this is generic advice, not vendor documentation
- Under the central electronic-register rule set referenced for Indian labour registers, an electronically kept
  register may have its *layout* adjusted provided "the integrity, serial number and column contents are not
  changed" — [greytHR, Records retention obligations of employer](https://blog.greythr.com/records-retention-obligations-of-employer)

### Inferences
- The cleanest resolution of the tension, and the one consistent with the Zoho/IRP behaviour above, is to split the
  lifecycle into two states and never let a bug fix cross the boundary:
  - **Draft/derived** artifacts (not yet relied on, not yet produced to an inspector or signed) are pure cache
    entries keyed by the content hash. A template or generator bump changes the key, so the old object simply
    stops being addressed — no invalidation logic is needed, which is the main practical argument for putting
    `template_version` and `generator_version` *inside* the hash rather than maintaining a separate invalidation
    table.
  - **Filed/attested** artifacts are frozen at the moment of attestation (signature, download-for-inspection,
    or explicit "mark as filed"). They are never re-keyed and never regenerated. A later bug fix produces a
    *new* artifact with a new key and a supersession edge (`supersedes_document_id`), leaving the old one
    readable with its original provenance.
- This makes the key schema do double duty: `content_key` is the cache identity, and a separate immutable
  `document_id` (ULID/UUID) is the *legal* identity that an audit trail, a signature and an inspector's reference
  number point at. Signing the content hash rather than the document id is what ties the two together.
- The "layout may change, contents may not" rule quoted for electronic labour registers is useful leverage: it
  implies a presentation-only template change (column widths, fonts, page setup) is *not* a semantic change to
  the register. A mature implementation therefore versions the template in two parts — `layout_version` and
  `semantic_mapping_version` — and only the semantic one forces a new filed document; a layout-only bump can be
  allowed to re-render a draft without creating a correction. This is an inference from the rule's wording, not
  a pattern any source documents.
- Operational corollary: keep a small `generator_manifest` table recording, per version, the git SHA, template
  file hashes and the mapping config, so a document generated 5 years ago can be *re-rendered for comparison*
  (not replacement) using the exact generator that produced it. Without this, "prove this file came from these
  inputs" is unanswerable after the first refactor.

### Gaps
- Found no engineering write-up from any named SaaS vendor describing template-version-in-cache-key vs
  immutability. This appears to be genuinely under-documented publicly; the report should present it as a
  reasoned design rather than an observed industry standard.
- No source on how teams handle the hardest sub-case: a generator bug that produced a *wrong filed document*
  which was already accepted by a regulator. The Zoho precedent (cancel + reissue with a new number) is the
  nearest analogue but is specific to a government-registry flow with an official cancellation API.

---

## Immutability and versioning of filed documents: WORM, S3 Object Lock, retention, legal hold

### Takeaway
S3 Object Lock gives per-object-version WORM with two modes — governance (bypassable by a privileged principal
with an explicit header) and compliance (bypassable by nobody, including the root account) — and a separate,
indefinite legal hold; compliance mode is irreversible and is the main footgun, so vendor guidance is to prototype
in governance mode first.

### Cited Findings
- Governance mode is reversible by privileged callers: a user must hold `s3:BypassGovernanceRetention` and must
  explicitly include the header `x-amz-bypass-governance-retention:true` in the request — [AWS S3 user guide, Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.md)
- Under compliance mode "its retention mode can't be changed, and its retention period can't be shortened" — [AWS S3 user guide, Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.md)
- Legal hold has no expiration date and "remains in place until you explicitly remove it"; it is orthogonal to
  retention — placing a legal hold "doesn't affect the retention mode or retention period for that object
  version", and removing a hold does not release an active retention period — [AWS S3 user guide, Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.md)
- Protection is per object *version*, not per object or key: "placing a retention period or a legal hold on an
  object protects only the version that's specified in the request" — [AWS S3 user guide, Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.md)
- Object Lock requires S3 Versioning to be enabled on the bucket — [AWS S3 user guide, Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.md)
- Vendor guidance recommends testing retention-period settings in governance mode before creating any
  compliance-mode retention period, and warns to agree on the retention requirement and the consequences of
  keeping incorrect or unnecessary data first, because compliance mode is irreversible — [Scaleway, S3 Object Lock](https://www.scaleway.com/en/docs/s3-object-lock/); [centron, Object Lock: legal hold & retention](https://docs.centron.de/en/docs/product/storage/s3-object-storage/how-tos/schutz-verwaltung/object-lock/)
- Third-party overviews of S3-compatible implementations describe the same two-mode + legal-hold model, indicating
  the semantics are portable across S3-compatible stores (relevant since this project uses MinIO locally) — [VAST Data, S3 object locking overview](https://kb.vastdata.com/documentation/docs/s3-object-locking-overview); [Switch Cloud, Object Lock](https://cloud.switch.ch/-/documentation/s3/object-lock/)

### Indian retention periods (what the lock duration must be set to)
- Minimum Wages (Central) Rules, 1950 required the register and muster roll to be kept for **three years** after
  the last entry; the Payment of Wages route is likewise described as three years — [greytHR, Records retention obligations of employer](https://blog.greythr.com/records-retention-obligations-of-employer)
- Practitioner commentary on the Labour Codes states a **five-year** retention period for wage, attendance,
  overtime and deduction records, and says the Codes and rules "expressly permit electronic maintenance and
  authentication of registers" — [CalcGuru, Registers and returns under the Labour Codes](https://calcguru.in/?p=8555)
- Delhi's labour department lists a **ten-year** preservation period for the register of wages in Form 'D', with
  exceptions where a combined muster-roll-cum-wage register is kept — [Delhi Labour Welfare Board, Maintenance of registers by employers](https://dlwb.delhi.gov.in/dlwb/maintenance-registers-employers)
- Gujarat's rules also use a ten-year period for certain records; the Labour Welfare Fund (Gujarat) (Amendment)
  Rules, 2021 omitted a register-maintenance provision but does not wholly prevent employers keeping physical
  records — [SCC Online blog](https://scconline.com/blog/post/2021/08/20/labour-welfare-fund-gujarat-amendment-rules-2021-omits-the-provision-for-maintenance-of-registers)

### Inferences
- The 3/5/10-year spread across central rules, the Codes and state rules is itself a design constraint: a single
  hardcoded `retain_until` is wrong. Retention should be computed per document from
  `(register_type, state, period_end)` via a lookup table, with a conservative floor (10 years is the maximum
  seen in these sources) where the applicable rule is uncertain. Under compliance mode a too-long period cannot
  be shortened, so the safe posture is **governance mode with a long period** plus tight IAM on
  `s3:BypassGovernanceRetention`, reserving compliance mode for documents actually produced to a regulator.
- Because Object Lock is per object version and requires versioning, the "never regenerate" rule and the WORM
  rule reinforce each other: if the key is the content hash, there is only ever one version per key, so
  versioning adds no storage cost in the normal path and the lock is unambiguous.
- Legal hold maps cleanly onto an active inspection or dispute: set it when an inspection reference is opened on
  an establishment, clear it when closed. Its indefinite, orthogonal behaviour is exactly the semantics wanted,
  and it is a cheap per-object flag rather than a new copy of the data.
- Known gotchas worth stating from the sources' own warnings plus the mechanics: a bucket with locked objects
  cannot be emptied or deleted until every lock expires, which makes tenant offboarding and test-data cleanup
  hard — so Object Lock belongs on a **separate bucket** holding only filed artifacts, never on the general
  working/draft bucket. Lifecycle expiration cannot delete a locked version either, so retention tiering must be
  transition-only, not expiration.

### Gaps
- `docs.aws.amazon.com` does not resolve from this session, so exact API parameter names
  (`x-amz-object-lock-mode`, `x-amz-object-lock-retain-until-date`), the maximum retention period, whether
  Object Lock can be enabled on an existing bucket, and the published Object Lock pricing could not be verified
  against AWS's own page. **This host needs to be allowed in the session's network settings** to confirm them.
  The report should mark these as unverified.
- Found **no sources at all** on SEC 17a-4 requirements in this research pass, so the US broker-dealer WORM
  framing (and whether S3 Object Lock compliance mode is assessed as 17a-4(f)-compliant) is unsourced here.
- Found no DPDP Act (India) source addressing storage limitation vs statutory retention. Note the tension exists
  in principle — DPDP's storage-limitation duty vs a 10-year labour-register retention — but I have no citation
  for how it resolves, and the report should not assert one.

---

## Audit trail: what makes a generated document defensible

### Takeaway
For India specifically, the law has moved in a direction that makes a provenance manifest unusually concrete:
Section 63 of the Bharatiya Sakshya Adhiniyam, 2023 replaced Section 65B of the Evidence Act from 1 July 2024 and
is reported to require the certificate accompanying an electronic record to disclose a **hash value** — a
requirement absent from the old §65B(4) — which means the artifact hash is not merely good engineering but part
of the admissibility paperwork.

### Cited Findings
- Section 63 BSA replaced Section 65B of the Indian Evidence Act with effect from **1 July 2024**; proceedings
  initiated before that date continue under the Indian Evidence Act — [ipleaders, Electronic evidence under the BSA 2023](https://blog.ipleaders.in/electronic-evidence-under-the-bsa-2023/)
- Section 63 carries forward the four conditions for admissibility and the certificate requirement; commentators
  describe the certificate as still "a valid and essential document for authenticating electronic evidence" — [K&K, Legal note on Section 63 BSA](https://ksandk.com/litigation/section-63-bharatiya-sakshya-adhiniyam-2023/)
- Reported changes vs §65B: a **two-signatory certificate** (a responsible person plus an expert) and a
  **mandatory hash value** — "the certificate must disclose the hash value of the electronic record, a
  requirement absent from Section 65B(4) of the 1872 Act" — [Bhatt & Joshi Associates, Electronic evidence under BSA 2023](https://bhattandjoshiassociates.com/?p=32215); [legalserviceindia, Admissibility of electronic records under s.63 BSA](https://www.legalserviceindia.com/legal/article-17611-admissibility-of-electronic-records-understanding-section-63-of-the-bharatiya-sakshya-adhiniyam-2023-bsa.html)
- Section 63 applies wherever the BSA applies — civil suits, criminal trials and most tribunals — [lawarticle.in, Electronic evidence: s.63 BSA vs s.65B IEA](https://lawarticle.in/electronic-evidence-section-63-bsa-vs-section-65b-iea/)
- Sources disagree on the certificate's signatory details and none quoted the enacted statutory text in full;
  commentary is secondary (law-firm blogs and legal-service sites) — see the conflicting treatments at
  [apnilaw comparison](https://www.apnilaw.com/legal-articles/acts/section-65b-of-the-indian-evidence-act-vs-section-63-of-the-bharatiya-sakshya-adhiniyam-admissibility-electronic-evidence/) and [lawsikho](https://lawsikho.com/blog/?p=7126)
- Who may certify remains unsettled: commentary reports India's Supreme Court has left open the question of who
  can certify digital evidence — [legalserviceindia, Who can certify digital evidence?](https://www.legalserviceindia.com/Legal-Articles/?p=26477)
- On the tamper-evident-ledger question, the managed-service landscape has shrunk: AWS **ended QLDB on
  31 July 2025**, with data not migrated permanently deleted — [Tutorials Dojo, Amazon QLDB (retired)](https://tutorialsdojo.com/amazon-quantum-ledger-database-qldb/); [Classmethod, QLDB EOS announcement](https://dev.classmethod.jp/articles/amazon-qldb-eos-announcement/)
- AWS's recommended migration target is Amazon Aurora PostgreSQL, which provides "ledger-like capabilities using
  extensions"; a sample migration repo (`aws-samples/example-qldb-ledger-migration`) exists — [Tutorials Dojo](https://tutorialsdojo.com/amazon-quantum-ledger-database-qldb/)
- Critically, Aurora is not a like-for-like replacement for verifiability: "while Aurora offers detailed audit
  logging and permanent log retention, it does not include cryptographic verifiability" — [Codenotary, QLDB to immudb Vault](https://codenotary.com/blog/navigating-the-transition-from-amazon-qldb-to-immudb-vault) (vendor blog — treat as promotional)
- Remaining managed options with cryptographic linking: Azure SQL's ledger feature "captures and cryptographically
  links data changes to make the data tamper-evident and verifiable" — [Microsoft/QLDB-to-Azure-SQL-ledger migration write-up](https://app-pack.telkomuniversity.ac.id/?p=485228); and immudb Vault, described by its vendor as cryptographically secure and immutable — [Codenotary](https://codenotary.com/blog/navigating-the-transition-from-amazon-qldb-to-immudb-vault)

### Inferences
- The §63 BSA hash requirement effectively specifies the minimum provenance record. An **evidence manifest**
  stored alongside each filed artifact should carry, at minimum: the artifact's hash and algorithm (so the §63
  certificate can be generated mechanically rather than drafted by hand), the generating user and their role,
  the UTC and IST timestamps, the establishment/period, the input snapshot hash and the ids+versions of every
  input row, the template and mapping versions, the generator git SHA and runtime versions, the assumption set
  applied, and the signature (if any). Storing the manifest as its own immutable S3 object next to the artifact
  — plus a Postgres row for querying — means the bundle an inspector receives is self-describing.
- The manifest should be hashed too, and the §63 certificate should be generated *from* the manifest. Because the
  certificate is reported to need two signatories including an expert, the product's job is to make the technical
  half trivially producible on demand for any document, for any date in the retention window.
- On whether a tamper-evident log is worth it: given QLDB's retirement and that Aurora Postgres explicitly does
  not provide cryptographic verifiability, the pragmatic answer on this stack is **append-only Postgres with
  hash chaining**, implemented in application code: an `audit_events` table with `prev_hash`, `payload_hash` and
  `chain_hash = H(prev_hash || payload_hash)`, a `REVOKE UPDATE, DELETE` grant for the app role, and a periodic
  job that writes the current chain head to an Object-Locked S3 object (and optionally emails/timestamps it) so
  the head is anchored outside the database. That anchoring step is what converts "we have a hash column" into
  actual tamper *evidence* — without it, an attacker with DB write access can recompute the whole chain.
- A full Merkle/transparency-log is likely over-engineering for a single-firm compliance cockpit; its advantage is
  efficient inclusion proofs for third parties, which matters at public-log scale, not at inspection scale. The
  periodic anchored chain head gives most of the value at a fraction of the complexity.

### Gaps
- Every BSA §63 citation is secondary commentary; no source quoted the enacted text. The hash-value and
  two-signatory claims should be verified against the statute before the report states them as settled, and the
  sources disagree on the signatory detail.
- No source found on how courts are applying §63 in practice, or whether §65B case law carries over.
- IT Act §10A (legal recognition of electronic contracts) was not covered by any result in this pass.
- No primary AWS source on the QLDB→Aurora ledger extension names, so the "ledger-like capabilities using
  extensions" claim is from a secondary summary only.

---

## Derived-document regeneration and flagging assumptions to a reviewer

### Takeaway
This is the weakest-sourced area of the assignment: I found **no documented precedent** in accounting, tax or
payroll SaaS for flagging assumptions on the face of a generated output document, and should say so plainly
rather than infer a standard.

### Cited Findings
- The only adjacent documented practice found is the "exception journal" idea in Indian accounting integrations —
  a third-party guide says Zoho and Tally "typically use versioning and exception journals" around e-invoice
  sync — [Ai Accountant, e-invoice IRN/QR integration guide](https://www.aiaccountant.com/blog/einvoice-irn-qr-integration-guide); this is generic, unattributed advice and not a vendor-documented feature
- The relevant hard constraint on how assumptions may be surfaced *inside* a statutory register: an electronically
  kept register may have its layout adjusted only if "the integrity, serial number and column contents are not
  changed" — [greytHR, Records retention obligations of employer](https://blog.greythr.com/records-retention-obligations-of-employer)

### Inferences
- The layout rule above implies assumptions must **not** be written into the statutory form's own columns, since
  that would change column contents. The defensible placement is therefore outside the statutory artifact: an
  accompanying cover note / provenance sheet, a separate worksheet in the same workbook clearly marked as not
  part of the prescribed form, or a reviewer-facing UI panel — with the assumption set recorded in the evidence
  manifest in all cases.
- A workable model, by analogy with how review workflows generally gate sign-off: classify each assumption as
  `inferred` (attendance assumed full because no attendance data existed), `defaulted` (a rate taken from
  configuration), or `overridden` (a human changed a computed value), store them as structured rows keyed to the
  document, include them in the content hash (so accepting an assumption changes the document identity), and
  block the "mark as filed" transition while any `inferred` assumption is unacknowledged. This is a reasoned
  design, not an observed pattern.
- Because assumptions are in the hash, the common real-world sequence works without special-casing: attendance
  data arrives late → the assumption disappears → the key changes → a new document is generated and supersedes
  the old one, with the old one still readable and still showing that it was built on an assumption.

### Gaps
- No precedent found in Avalara, Vertex, Gusto, ADP, Xero, ClearTax or Stripe Tax documentation for assumption
  flagging on outputs. Searches in this pass returned no primary vendor documentation for any of them on
  document versioning or provenance either (see next section). This should be reported as a genuine absence of
  public evidence, not as "nobody does it".

---

## Cost engineering for document generation

### Takeaway
The cost levers are well understood in the abstract — queue + worker, pre-signed URL so the app never streams
bytes, lazy-on-first-request generation, archive tiering — but the specific numbers available for S3 archive
tiers in Nov 2026 come only from third-party pricing blogs that disagree with each other, and one of them warns
Intelligent-Tiering can cost *more* than manual Deep Archive when retrieval is rare.

### Cited Findings
- S3 Glacier Deep Archive is quoted at about **$0.00099/GB-month** in us-east-1 (~$1.01/TB-month), and
  Intelligent-Tiering's Deep Archive Access tier at the same rate — [LeanOps, AWS S3 Glacier pricing 2026](https://leanopstech.com/blog/aws-s3-glacier-pricing-2026/); [Nubbo, AWS S3 pricing 2026](https://nubbo.app/blog/aws-s3-pricing-2026)
- Intelligent-Tiering Archive Access tier is given as **$0.0036/GB** by one source and **$0.004/GB** by another —
  the figures are unsettled — [Nubbo](https://nubbo.app/blog/aws-s3-pricing-2026); [usage.ai, Glacier Deep Archive pricing](https://www.usage.ai/blogs/aws/storage-cost/glacier-deep-archive-pricing/)
- Deep Archive restores are quoted at **12–48 hours**; Intelligent-Tiering's Deep Archive Access tier at ~12 hours
  and its Archive Access tier at **3–5 hours** — [Binadox](https://www.binadox.com/?p=21167); [LeanOps](https://leanopstech.com/blog/aws-s3-glacier-pricing-2026/)
- Intelligent-Tiering is consistently described as charging **no retrieval fees**, including for its archive
  tiers, whereas manually managed Deep Archive retrieval is cited at about **$0.02/GB** — [Cloudian, components of S3 pricing](https://cloudian.com/blog/5-components-of-aws-s3-storage-pricing.md); [usage.ai, S3 cost calculator](https://www.usage.ai/blogs/aws/storage-cost/s3/cost-calculator/); [usage.ai, Deep Archive](https://www.usage.ai/blogs/aws/storage-cost/glacier-deep-archive-pricing/)
- Intelligent-Tiering charges a **monitoring fee per 1,000 objects** (cited at $0.0025), which matters
  disproportionately for buckets of many small objects — [usage.ai, S3 cost calculator](https://www.usage.ai/blogs/aws/storage-cost/s3/cost-calculator/)
- Objects only reach Intelligent-Tiering's archive tiers after long untouched periods, reported as **90+ days**
  (Archive Access) and **180+ days** (Deep Archive Access) — [Spendark, S3 storage class pricing](https://spendark.com/blog/s3-storage-class-pricing/)
- One source argues Intelligent-Tiering's archive tier can cost more than manual Deep Archive precisely when
  retrieval is rare — i.e. the monitoring fee outweighs the avoided retrieval fee — [usage.ai](https://www.usage.ai/blogs/aws/storage-cost/glacier-deep-archive-pricing/)
- Carbone's own README cites roughly **10 ms per report without conversion and ~50 ms with conversion** for a
  basic one-page DOCX template, and notes it manages multiple LibreOffice workers started in headless server
  mode — [Carbone on GitHub](https://github.com/carboneio/carbone); these are vendor figures, not independent benchmarks

### Inferences
- The numbers above argue for a specific tiering choice for labour registers. A register workbook is small
  (tens to hundreds of KB) and the corpus is many small objects, so the per-1,000-object Intelligent-Tiering
  monitoring fee is the dominant term and the storage saving is negligible in absolute rupees. For a firm with,
  say, 100k registers at 200 KB each (~20 GB), Standard storage is roughly $0.46/month — tiering saves cents
  while adding 12-hour retrieval latency on the exact artifact an inspector is asking for. **The honest
  conclusion is that archive tiering is the wrong lever at this scale**; keep filed registers in S3 Standard or
  Standard-IA and spend the engineering effort on not regenerating them. Revisit only if artifacts are large
  (PDF bundles with scans) or the corpus reaches multiple TB.
- Where the real money is: (a) not regenerating — the content-hash cache; (b) not streaming bytes through the
  Node app — issue a pre-signed `GET` (S3 `getSignedUrl`, short TTL, `response-content-disposition` set to the
  statutory filename) so App Runner CPU/memory and egress-through-app are avoided entirely; (c) building in a
  worker, not in a request — a 50 ms Carbone render is fine inline but a LibreOffice PDF conversion under
  concurrency is not, and the queue is what stops a burst of users from exhausting the LibreOffice worker pool.
- Lazy-on-first-request is the right default for registers precisely because of the retention asymmetry: most
  registers are never opened again after filing, so eager monthly batch generation for every establishment pays
  full compute for artifacts nobody reads. The exception is deadline-driven work (a filing due date), where eager
  pre-generation overnight converts a latency problem into a throughput problem the queue can absorb.
- On this project's stack the queue already exists (Inngest), so the shape is: route checks
  `generated_documents` by content key → if `ready`, return pre-signed URL → else insert-on-conflict and enqueue
  a build → client polls or receives a notification. The single-flight guarantee comes from the unique index,
  and Inngest's own idempotency/concurrency keys should be set to the same content key so a duplicate enqueue
  does not start a second LibreOffice render.

### Gaps
- Could not verify any S3 price against AWS's own pricing page (`docs.aws.amazon.com` unreachable; aws.amazon.com
  did not surface). All figures above are third-party 2026 blogs and two of them disagree on the
  Intelligent-Tiering Archive Access rate. The report must present these as approximate and unverified.
- No source found on Object Lock's own pricing or whether it carries a surcharge.
- No independent benchmark found for any document generator's throughput; only vendor-published figures.

---

## Excel/PDF generation libraries and template fidelity

### Takeaway
For reproducing a statutory Excel form cell-for-cell, template-filling beats building from scratch, and the
library choice follows directly: **xlsx-populate** is explicitly designed to modify an existing workbook without
losing formatting, SheetJS's community edition is reported to strip most styling on write, and ExcelJS has
specific documented limitations around print areas and merged cells; merged cells sitting outside a declared
print area is a known cause of clipped PDF output.

### Cited Findings
- xlsx-populate's own documentation states you can open, modify and save Excel files "without losing formatting,
  formulas, or other advanced features"; the pattern is `fromFileAsync` → `cell(...).value(...)` →
  `toFileAsync` — [xlsx-populate on npm](https://npmjs.com/package/xlsx-populate); [xlsx-populate repo](https://www.github.com/dtjohnson/xlsx-populate)
- xlsx-populate does **not** recalculate formulas: it "will not recalculate the values as you manipulate the
  workbook and will not write the values to the output" — [xlsx-populate](https://npmjs.com/package/xlsx-populate)
- Guidance for xlsx-populate is to write to a new output file rather than overwrite the template ("never
  overwrite source files") — [xlsx-populate skill doc](https://cdn.jsdelivr.net/gh/zgldh/xlsx-populate-skill@master/SKILL.md)
- A third-party Node Excel library comparison reports that SheetJS's free Community version "silently drops data
  validations on write" and "strips most styling" — [mfyz, Node.js Excel library comparison](https://mfyz.com/nodejs-excel-library-comparison/); single third-party benchmark, not official SheetJS documentation
- ExcelJS originally supported only a single print area per sheet — "excel sheets can have multiple print areas,
  but the pageSetup of a sheet currently only accepts a single print area"; the docs now show multiple ranges
  joined with `&&`, e.g. `'A1:G10&&A11:G20'` — [ExcelJS issue #1041](https://github.com/exceljs/exceljs/issues/1041)
- ExcelJS has a reported defect where merged cells are not copied when copying worksheets — [ExcelJS issue #292, referenced via the issue tracker](https://issues.ecosyste.ms/hosts/GitHub/repositories/exceljs%2Fexceljs/issues?page=10)
- Inspecting merges after a round trip is possible but awkward; there is an open question-issue on how to find
  merged rows — [ExcelJS issue #2734](https://www.github.com/exceljs/exceljs/issues/2734)
- Print-area/merge interaction causes real clipping: in an Aspose.Cells case, a PDF export lost the bottom of the
  sheet because "you have set the printable area 'A1:H40' and in your template file, C40 is a merged cell
  (C40:H40)" — [Aspose forum](https://forum.aspose.com/t/problem-with-cells-in-converting-to-pdf/96898)
- Merged cells inside repeating/looped regions are a documented hazard in template engines: they "may cause
  abnormal rendering results, such as lost merge effects or data misalignment", with the guidance to merge only
  above or to the right of a table, never below or to the left, and to use "Center Across Selection" instead of
  a true merge — [NocoBase template-print FAQ](https://docs.nocobase.com/template-print/faq)
- Rows generated by a loop push down static content beneath them, "directly overwriting or pushing down the
  static content below, causing format disorder and content overlap"; the recommendation is to place the loop
  region at the bottom of the sheet or leave buffer rows — [NocoBase template-print FAQ](https://docs.nocobase.com/template-print/faq)
- Merges can be dropped entirely on export in some engines: a Qlik NPrinting report notes "merged cells in Excel
  templates are not kept merged in the produced report" — [Qlik community](https://community.qlik.com/t5/Qlik-NPrinting-Discussions/exporting-text-column-to-excel-reports/m-p/1355783)
- Carbone fills placeholders in a template authored in LibreOffice or Microsoft Office and accepts "any XML-based
  document as a template", exporting XLSX, DOCX, PDF and others from JSON — [Carbone](https://github.com/carboneio/carbone)
- Carbone's PDF output depends on LibreOffice; without LibreOffice it can still produce docx, xlsx, pptx, odt,
  ods, odp, html provided the template is in the same format — [Carbone](https://github.com/carboneio/carbone)
- Carbone runs LibreOffice in headless server mode and manages multiple workers; a maintainer describes
  LibreOffice conversion as "the most reliable and stable one in production for now" — [Carbone](https://github.com/carboneio/carbone)
- Carbone additionally requires Python alongside LibreOffice, and notes LibreOffice from the `libreoffice/ppa`
  does not bundle the Python it needs — [Carbone](https://github.com/carboneio/carbone)
- Carbone's Community Edition is distributed under its own "CCL Agreement" rather than a standard OSS licence — [Carbone](https://github.com/carboneio/carbone)

### Inferences
- Recommended shape for a statutory Excel form: author the prescribed form **once** as a real `.xlsx` template
  (merged headers, column widths, A4 landscape page setup, print area, repeat-header rows all set in Excel/
  LibreOffice by a human), commit it under `public/templates/` with a content hash, and have the generator only
  write values into named cells / a known data region. Building the form from scratch in code means re-deriving
  the merge map, column widths and page setup in TypeScript, which is both more code and more fragile — exactly
  the class of bug that would force a filed-document correction.
- Because the data region grows, the NocoBase warnings are directly applicable: put the repeating muster-roll
  rows at the **bottom** of the sheet with the totals block either above the table or in a separate sheet, and
  avoid true merges inside the repeating region (use Center Across Selection for visual centring). Do this in
  the template, not in code.
- The Aspose print-area case generalises to a required test: after generation, assert that the print area's last
  row is ≥ the last written row and that no merge range crosses the print-area boundary. This is cheap to assert
  in Vitest against the generated workbook and prevents the single most likely "the PDF is missing the last
  page" inspection embarrassment.
- Library choice on this stack: **xlsx-populate** for template-fill fidelity, with the formula caveat handled by
  writing computed values rather than formulas (which is also better for evidence — a register showing a formula
  is a register whose number depends on the reader's Excel). ExcelJS is the better choice only if the sheet is
  built from scratch or needs streaming for very large outputs, and then the print-area `&&` syntax and the
  worksheet-copy merge defect must be worked around. SheetJS community is the wrong tool for a styled statutory
  form given the reported style stripping.
- For PDF: rendering the same template through **LibreOffice headless** (directly, or via Carbone/Gotenberg)
  gives Excel-to-PDF pagination that matches the Excel print setup, which is what an inspector compares. The
  cost is a heavy binary in the container and a worker pool; Carbone's value-add is the worker management and
  Python/LibreOffice packaging, at the price of a non-standard licence (CCL), which the firm should review.
  Gotenberg packages LibreOffice behind an HTTP API in its own container, which fits App Runner poorly (it wants
  a sidecar) — a separate worker service or an ECS task is the cleaner placement. Note Gotenberg itself is
  **unsourced** in this pass.

### Gaps
- No results at all for Gotenberg or docxtemplater in this pass, so their XLSX capabilities (docxtemplater's XLSX
  module being paid, per my prior knowledge) are **unverified** and should not be stated as fact in the report.
- Could not confirm from ExcelJS's own docs whether `pageSetup.printArea` and merges survive a load→save round
  trip; the suggested verification is to compare `worksheet.model.merges` before and after, per the issue
  tracker. No source confirms the outcome.
- openpyxl was not researched (Python, off-stack); its known `keep_vba`/style-loss behaviour is unsourced here.
- No source found on font substitution behaviour in LibreOffice headless conversions (a real fidelity risk for
  Indian-language register headers), so that risk is flagged but uncited.

---

## Digital signature / attestation on generated documents

### Takeaway
A hash-out / sign-externally / embed-back flow is the standard way to apply a PAdES signature when the key lives
in an HSM, a USB token or an Indian ESP, and at least one Node library documents an "Indian eSign (CCA)" path
end to end; whether an *unsigned* Excel register is acceptable could not be established from any source.

### Cited Findings
- The remote-signing flow is three-step and hash-only up front: with PKCS#7, "only the document hash is computed
  up front, and the certificate isn't needed until the finalize step" — which is exactly the shape an eSign/ESP
  round trip requires — [nsoftware PDFSign docs](https://cdn.nsoftware.com/help-ai/EPM/go/PDFSign.md)
- PAdES B-B contains only signing time and signer information; **B-T adds a trusted timestamp** — [nsoftware PDFSign docs](https://cdn.nsoftware.com/help-ai/EPM/cpp/PDFSign.md)
- A Node library (ATick) documents an "Indian eSign (CCA)" workflow — prepare and hash the PDF, build and sign
  the request XML, embed the ESP response — and lists eSign as a deferred signing method alongside PFX/P12 and
  USB-token signing — [ATick Node guide](https://atick-node.readthedocs.io/en/latest/guide.html)
- Chilkat's Node.js PAdES-Baseline-B example signs with a certificate and sets the subfilter to
  `ETSI.CAdES.detached`, the PKCS#7/CMS detached signature form — [Chilkat Node PAdES example](https://example-code.com/nodejs/pdf_PAdES_Baseline_B.asp); [JS variant](https://example-code.com/js/pdf_PAdES_Baseline_B.asp)
- Commentary on the Labour Codes states the Codes and rules "expressly permit electronic maintenance and
  **authentication** of registers" — [CalcGuru](https://calcguru.in/?p=8555); secondary source, and it does not
  say what form the authentication must take
- An electronically maintained register's integrity, serial number and column contents must not change — [greytHR](https://blog.greythr.com/records-retention-obligations-of-employer)

### Inferences
- The practical design is to treat the **PDF as the signable artifact and the Excel as the working/working-copy
  artifact**. XLSX digital signatures exist in OOXML but are poorly supported outside Microsoft Office and are
  not a PAdES-equivalent; a signed PDF rendition of the same template, with its hash recorded in the manifest
  and cross-referenced to the XLSX's hash, is far easier to defend and to verify years later.
- Because the signing flow is hash-first, it composes cleanly with content-addressed storage: the artifact is
  built and frozen, its hash goes to the signer (DSC on a Class 3 token held by the signatory, or an ASP→ESP
  eSign round trip), and the returned PKCS#7 blob is embedded to produce a *second* immutable object. Keep both
  — unsigned original and signed rendition — with an explicit relationship, so the signature can be
  re-verified against bytes that were never touched.
- PAdES **B-T** (with a timestamp from a TSA) rather than B-B is the right target for anything with a multi-year
  retention window, because B-B's signing time is self-asserted and a signer certificate will expire well inside
  a 10-year retention period. This follows from the nsoftware distinction above.
- Prefer a maintained general-purpose signing path over a bespoke one: this stack would most likely shell out to
  a signing service or use a commercial Node library, since correctly producing an incremental-update PDF
  signature (byte-range placeholder, `/ByteRange`, `/Contents` padding) by hand is a classic source of
  "signature invalid" reports.

### Gaps
- **No source found** on whether an unsigned Excel labour register is acceptable to a labour-department inspector.
  The CalcGuru line about "authentication" is the closest, and it is secondary and non-specific. This is an
  important open question and the report should present it as such, not resolve it.
- No CCA eSign API specification, ASP onboarding requirements, or per-transaction eSign pricing was retrievable;
  the India-specific eSign/ESP mechanics are therefore only sourced from one third-party library's guide.
- Nothing found on DSC Class 3 token handling in a server context (whether a token-held key can be used by an
  unattended worker at all), which is a material constraint on automating signatures.

---

## Concrete examples from named compliance/tax/payroll products

### Takeaway
This question largely failed: searches returned **no primary vendor documentation** for Avalara, Vertex, Gusto,
ADP, Xero, ClearTax or Stripe Tax on how they version or serve generated documents. The one product with usable
documented behaviour is Zoho Books' e-invoicing, which demonstrates strict post-filing immutability.

### Cited Findings
- Zoho Books: cancelling an e-invoice sets it to Void and "the action can't be reverted", because the IRN is
  derived from the invoice number; the documented remedy is to clone and reissue — [Zoho Books KB](https://www.zoho.com/in/books/kb/e-invoicing/undoing-cancellation-for-einvoice.md)
- Zoho Books: an invoice number that has been pushed to the IRP and cancelled cannot be reused — recreating it
  errors and a different number is required — [Zoho Books KB](https://www.zoho.com/in/books/kb/e-invoicing/irn-generated-cancelled.md)
- Zoho Books: IRNs do not sync automatically; a user must "Associate IRN" manually with the IRN, acknowledgement
  number and date, which are retrievable from the IRP for the first 2 days and from the GST Portal thereafter — [Zoho Books, IRN update](https://www.zoho.com/in/books/kb/e-invoicing/irn-update-in-zoho-books.md)
- Third-party claim (not vendor documentation) that Zoho and Tally "typically use versioning and exception
  journals" and that sync should prevent modifications after IRN generation — [Ai Accountant](https://www.aiaccountant.com/blog/einvoice-irn-qr-integration-guide)

### Inferences
- The Zoho/IRP pattern is the most transferable precedent available: a filed artifact is identified by a
  derived-and-unique identifier, is never mutated, cannot have its identifier reused, and corrections are new
  documents. That maps directly onto the content-hash + immutable `document_id` + `supersedes` design argued
  above, and it is worth citing in the report precisely because it is a real, documented, India-specific
  compliance product behaving this way.
- The absence of public documentation from the US payroll/tax vendors is itself informative: this layer
  (artifact versioning and provenance) is internal plumbing that vendors do not publish, so the report should
  not imply an industry consensus exists to copy.

### Gaps
- Avalara: no result returned on Returns document immutability or versioning. Unanswered.
- Vertex, Gusto, ADP, Xero, ClearTax, Stripe Tax: no sources found in this pass on generated-document versioning
  or serving. Unanswered. Targeted searches of each vendor's developer documentation would be needed.
