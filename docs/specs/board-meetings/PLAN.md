# Board meetings — plan and owner decisions

Owner: SBC. Decided in the 2 Nov 2026 session; designs on the "Create Board Meeting Notice"
canvas (claude.ai artifact FZAzHTLVDseikA8QWqHm1X) and the plan PDF ("Board Meeting Workflow
Plan", draft 6). This file is the spec the code follows.

## Workflow

| Day | Step | Who |
|---|---|---|
| T-10 | VCFO tells the lead to prepare the notice (task + bell + email) | System |
| T-10 to T-8 | Lead drafts the notice and agenda: director picker, agenda picker, copy from last meeting | Lead |
| T-8 to T-7 | Lead sends it for approval. The manager may edit the text, recipients, date, time and agenda, then approves or sends back | Manager |
| T-7 | On approval VCFO emails the notice: To the ticked directors and the CS, CC admin, manager, lead and others. Word file and `.ics` attached, Google and Outlook links, Teams link when the lead's Outlook allows it | System |
| T-7 to T-0 | Directors reply "I will attend / I can't attend" from the email (no sign-in). Quorum forecast (Sec 174). Reschedule and cancel send an update with the same calendar UID | Directors, lead |
| ≤ T+30 | Lead uploads the MoM received outside VCFO. VCFO emails it to the directors present for signature. The lead uploads the signed copy: locked. Final copy emailed to all directors, admin and lead | Lead, directors |
| After | Lead adds resolutions passed after the meeting, on the letterhead layout of a resolution by circulation. The selected directors sign (no manager step). Signed copy uploaded: locked. Final copy emailed to all | Lead, directors |
| Next notice | Locked resolutions become sub-points of "resolutions passed since the previous Board Meeting" (BM-007). After the next notice is sent, new resolutions go to the next meeting | System |

## Decisions

- One notice signature line (typed signatory name and DIN); no director signature before sending.
- Only the manager approves the notice; the admin is in CC.
- VCFO does not write minutes. There is one "Upload MoM" button; there is no "Request MoM".
- The resolutions list holds only resolutions added after the meeting; the MoM PDF holds the rest.
- Signed documents are locked: no edit, no replace.
- Phase 1 signing is "signed copy uploaded by the lead"; e-sign inside VCFO is a later phase.
- No new sidebar item. Placement: Incorporation › post-1 (first meeting), Compliances › Obligations
  › Non-statutory › New task › Type: Meeting (next meetings), Approvals (manager), Home card and
  the Obligations "Meetings" filter (admin), Firm settings › Agenda library, the client's
  Directors section, Compliances › Calendar, and the client portal Home, Obligations and Documents.
- The agenda library is the SBC master sheet (224 items, 16 topics) in
  `src/data/board-agenda-library.ts`, editable in Firm settings.
