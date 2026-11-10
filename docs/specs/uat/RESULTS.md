# Acceptance run results (10 Nov 2026)

Claude ran the 21 tests of `TEST-PLAN.md` on a private local copy of `main` (branch `claude/fervent-wozniak-anz82i`), as super admin, admin, manager, two leads and three clients. Production was not touched.

- Illustrated report (private artifact): https://claude.ai/artifact/TQRUrg3Wh9oPHJ77MdwSB8
- Rebuild it: `e2e/uat/tools/reset-local.sh`, start `next start` with the mail catcher (see `e2e/uat/tools/mail-catcher.mjs`), `UAT_CHROMIUM=/opt/pw-browsers/chromium npx playwright test --project=uat`, then `node scripts/build-uat-report.mjs --pdf` and `node scripts/build-uat-plan.mjs --results`.
- Every defect with cause and fix: `defects.json`.

## Fixed during the run (10)

- **D-T01-01** (S2) Super admin's "Portal" link crashes with "Something went wrong"
- **D-T04-01** (S3) "Proposed Directors" tab never shows its tick, though every required answer is in
- **D-T06-01** (S2) Requesting a file from the Vault never tells the client
- **D-T07-01** (S2) Approvals page shows "0 waiting" while registration steps wait for the manager
- **D-T07-02** (S2) The manager's reason for sending a step back is stored but never shown to the lead
- **D-T11-01** (S3) Board meeting errors show raw codes such as "bad_link"
- **D-T13-01** (S1) Monthly GST, PF and TDS filings were never generated after the registrations
- **D-T17-01** (S1) A budget cannot be published or approved unless a note is typed
- **D-T03-01** (S2) Creating a project fires about 48 failing task saves with demo assignees
- **D-T18-01** (S2) Ask VCFO tells an incorporated client their next step is the incorporation questionnaire

## Still open (5)

- **O-T13-02** (S3) The Lead column on Filings is empty, and GSTIN is not carried into the GST filing
- **D-T16-01** (S1) Payroll is saved only in the browser of the person who typed it
- **O-T18-02** (S2) Projects that start at Registration still show "Step 1 · Client Details" and "Incorporation 3/14"
- **D-T13-02** (S1) Right after registrations are approved, the compliance job sometimes misses the monthly filings
- **O-T08-01** (S3) In one full run the document pack showed every document as "waiting for release"

## Owner decisions (4)

- **O-T05-01** Part B capital is not checked against the authorised capital from Part A
- **O-T06-01** KYC Review asks for "review notes / correction requests" even when everything is approved
- **O-T13-01** Compliance list: missing filings and two dates to confirm
- **O-T14-01** Overdue filings do not change a project's health

## Needs a person

Real inbox delivery (SES/Resend), WhatsApp on a phone (Meta templates), Outlook connect and Teams links (each lead connects once; document-request emails are sent from the lead's Outlook), Ask VCFO answer quality (needs the model key), labour registers with the client's real attendance and leave sheets.
