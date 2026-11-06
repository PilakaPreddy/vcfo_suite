# VCFO Assist filing record (server side of the SPICe+ flow)

Suite holds the record of a SPICe+ filing and the files; the VCFO Assist extension and people do the
portal work. Suite never drives the MCA portal. No MCA login, password, OTP, DSC PIN or token is ever
stored, and the PATCH schema is strict so a stray field is refused. Software never signs: Suite only
reads signatures. Software filling on the live MCA portal needs written CS approval first, and the
card says so.

Code: `src/lib/mca-filing/` (pure logic, `filing-service.ts` runs the steps in order),
`src/db/repositories/assist-filings.ts`, `assist-attachments.ts`, `app/api/assist/engagements/[id]/`,
`src/components/incorporation/McaFilingCard.tsx`, `src/hooks/use-mca-filing.ts`,
`src/jobs/assist-filing-deadlines.ts`. Tables: `assist_filings`, `assist_filing_documents`.

## Rules every route shares

- Staff only (`super_admin`, `admin`, `manager`, `intern`). A client is 403, signed out is 401.
- 503 `{ ok: false, error: 'assist_not_set_up' }` while `VCFO_ASSIST_ENABLED` is off. The card hides.
- Another firm's engagement is 404 (the attachment routes answer 403, as `getSpiceAttachments` does).
- Errors are `{ ok: false, error: <code>, message?: <sentence> }`. A refusal has both.
- Every write records an audit event. Clients can read their engagement's audit events, so an event
  never quotes a remark or a note.

## Run subjects

`POST /api/assist/engagements/[id]/runs` takes `subjectKind: 'registration'` with `subjectKey`
`spice-part-a` or `spice-part-b`. Any other non `reg-N` key is 404.

## Attachments

`GET /attachments` returns `{ ok, items: [item] }`, one row per file:

```
{ key, group, label, status: 'not-started'|'waiting'|'done', available: boolean,
  fileName: string|null, size: number|null, contentType: string|null, note: string|null }
```

`available` is true only when the object is really in storage. `status` comes from the checklist and
says nothing about a file. A stored path outside this engagement's own folder reads as no file.

`GET /attachments/[key]` returns `{ ok, fileName, contentType, base64 }`. 6 MB at most: 413
`file_too_large` above it, 404 `no_file` when nothing is stored, 404 `not_found` for an unknown key.

| Key | Where the file lives | Real file today |
|---|---|---|
| `board-resolution` | The accepted signed copy: its Vault document, else `signed_storage_path` | Yes, once accepted |
| `parent-proof` | `pre-1` `certificateOfIncorporationUrl` | Yes, when uploaded |
| `office-proof.noc`, `office-proof.utility-bill` | `pre-14` `registeredOfficeNocUrl`, `registeredOfficeUtilityBillCopyUrl` | Yes, when uploaded |
| `director-kyc.<n>.<part>` (`aadhaar`, `pan`, `passport`, `driving-licence`, `utility-bill`, `photo`) | The copy fields of `pre-15` entry n | Yes, when uploaded |
| `dir-2.<n>`, `inc-9.<n>` | A signed upload on the legacy `pre-8` step | Older engagements only |
| `moa`, `aoa` | Only an unsigned Word draft on `pre-7` | Never |

A Word draft is never offered: it is unsigned and the portal takes PDFs. With no director listed,
`director-kyc`, `dir-2` and `inc-9` come back as one row under the bare key, not available. A row may
be available and still carry a `note` (not a PDF, or over 6 MB).

## Filing record

`GET /filing` returns `{ ok, engagementId, companyName, filings: [filing], documents: [document], missing: [{ key, label, stepId, ... }], signers: [signer] }`.

```
filing   = { form: 'spice-part-a'|'spice-part-b', state, srn, srnAt, nameApprovedAt, signedUploadedAt,
             paidAt, lastRemark, remarks: [{ at, byName, text }], reviewedBy, reviewedAt, reviewNote,
             signatureRequests: [{ signerId, name, email, at, byName, documentId,
                                   outcome: 'sent'|'no_email'|'not_configured'|'failed' }],
             next: { who, whoLabel, what },
             deadlines: [{ key: 'upload'|'payment'|'name', label, dueOn, daysLeft, source, confirmed }],
             moves: [state] }
document = { id, form, kind: 'portal_pdf'|'signed_pdf', fileName, size, sha256, textHash, signers, check,
             stale, uploadedBy, createdAt }
signer   = { id, name, email, role: 'director'|'subscriber'|'representative', hasDsc, dscExpiry }
```

Both forms always come back; one with no row reads as `data_ready`. States: `data_ready`,
`part_a_filling`, `part_a_submitted`, `name_approved`, `part_b_filling`, `pdf_review`,
`awaiting_signatures`, `signed_ready`, `upload_pending`, `payment_pending`, `submitted`, `approved`,
`resubmit`, `cancelled`. The Part A states fit only Part A; the moves are in `filing-state.ts`.

`PATCH /filing` takes `{ form, state?, srn?, srnOn?, remark?, paidOn?, signedUploadedOn? }` (dates are
`YYYY-MM-DD`, India time) and returns `{ ok, filing }`. Moving to `name_approved` starts the name clock,
moving to `payment_pending` stamps the upload date unless given, and recording `paidOn` while
`payment_pending` moves to `submitted`. Refusals: `invalid_move`, `state_not_for_form`, `not_reviewed`,
`no_signed_pdf`, `not_paid`, `bad_srn`, `date_in_future`, `not_part_b`, `empty_remark`.

`POST /filing/documents` takes multipart (`form`, `kind`, `file`) or JSON
(`{ form, kind, fileName, base64 }`), PDF only, 15 MB at most, and returns
`{ ok, document, filing, created }`: 201 when stored, 200 when the same bytes were already the latest
(nothing is added, so the extension can repeat a post). 413 `file_too_large`, 415 `not_a_pdf`.

- `portal_pdf`: text is read and compared with the assist profile. `check` is
  `{ checked, found, missing: [{ field, expected }], unreadable, pages, readerError }`. An image-only
  PDF is `unreadable`, never a pass. When the text differs from the last portal PDF, earlier signed
  copies go `stale`, the approval is cleared, and Part B returns to `pdf_review`.
- `signed_pdf`: refused and not stored unless every check passes. Refusals, in order:
  `signed_pdf_part_b_only`, `no_portal_pdf`, `not_reviewed`, `no_signature`, `digest_mismatch`,
  `signature_invalid`, `certificate_expired_at_signing`, `changed_after_last_signature`,
  `unreadable_pdf`, `text_differs_from_portal_pdf`, `signer_not_recognised`. `check` is
  `{ signatures, textMatchesPortalPdf, missingSigners, unmatchedSigners, trustChain: 'not_checked' }`.
  With every known signer in, the filing moves to `signed_ready`; otherwise it stays
  `awaiting_signatures`, and a later copy with more signatures can be added.

`GET /filing/documents/[docId]/file` returns `{ ok, fileName, contentType, base64 }`; another
engagement's document is 404.

`POST /filing/review` takes `{ form, note? }` and returns `{ ok, filing }`. `no_portal_pdf`;
`missing_values_need_note` while values are missing, the PDF is unreadable or nothing was compared,
unless a note is given.

`POST /filing/signature-requests` takes `{ form, signerIds? }` and returns
`{ ok, filing, requests: [...] }`. Only when staff press the button: each signer gets a separate email
with a link to the latest portal PDF, and the PDF attached when it is 7 MB or less. `no_portal_pdf`,
`not_reviewed`, `no_signers`.

## What a signature check does and does not mean

`pdf-signatures.ts` checks the ByteRange digest and verifies the signature with the certificate inside
the file. It does **not** check the chain to the CCA root, revocation or timestamps, so a self-made
certificate passes. A name match compares the certificate's name only. The portal checks the chain
when the form is uploaded. Text hashes compare page text in a normal form (lower case, letters and
digits only); signature appearances are annotations, not page text.

## Clocks

Upload within 15 days of the SRN and pay within 7 days of the signed upload (MCA FAQ). Name validity
of 20 days comes from a secondary source and is marked `confirmed: false`; check it against the MCA
rules before relying on it. Resubmission clocks after an ROC remark are not modelled.

Daily at 08:40 India time `assist-filing-deadlines` gives the lead (else the manager) an in-app
notification when an upload or payment date is within 3 days, or up to 7 days late, once per filing,
deadline and day (`alerted_on`). No email, WhatsApp or client message. It reuses the
`compliance.reminder` notification kind, so `src/lib/checklist/` stays unchanged.

## Gotchas

- `pdfjs-dist` is in `serverExternalPackages`. `pdf-text.ts` imports the worker by name, so the file
  tracer keeps it in standalone output, and sets `globalThis.pdfjsWorker` so it runs in this process.
- It needs Node 22.13 or later. The `@napi-rs/canvas` optional dependency arrives by npm for both
  glibc and musl; text reading does not draw, so a missing one would only log a warning.
- In vitest a PDF test needs `// @vitest-environment node`. `pdfkit` is a transitive dependency of
  `@react-pdf/renderer`, used only by tests here.
- Signature links are S3 presigned URLs with a 72 hour request. On App Runner they are signed with the
  instance role, so a link stops working when that role's session ends, which can be sooner. That is
  why the PDF is attached as well. There is no public route, because every route here is staff-only.
