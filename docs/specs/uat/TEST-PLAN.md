# VCFO Suite: 10-day test plan with real users

Written in ASD-STE100 Simplified Technical English.
Test window: Day 0 is 9 November 2026. Day 1 to Day 10 are 10 to 19 November 2026.

## 1. Scope

This plan tests each main feature one time from start to end, with real people and one real client.
It does not test each sub-feature. Find a sub-feature defect during the main test, then record it.

| Feature group | Main features in this plan |
|---|---|
| Base | Data reset, deploy, logins and roles, project creation |
| Pre-incorporation | Client questionnaire, SPICe+ checklist (34 steps), manager approvals, MCA document pack, board resolutions |
| Post-incorporation | Incorporation close, post-incorporation stage, board meetings |
| Registration | Registrations |
| Compliance | Compliance calendar, filings, reminders |
| Chatbot | Ask VCFO |
| Labour registers | Labour registers |
| Budgets | Budgets |
| Payroll | Payroll |
| Emails and WhatsApp | Email, WhatsApp (these run each day, with each feature) |

## 2. Test team

| Role in app | Person | Count | Task |
|---|---|---|---|
| `super_admin` | Owner | 1 | Do the reset and the deploy. Approve each day. |
| `admin` | Firm admin | 1 | Create the project. Monitor the full firm. |
| `manager` | Manager | 1 | Approve or reject each step. Send to the client. |
| `intern` | Project lead | 2 or 3 | Fill each step. Upload documents. Use Ask VCFO. |
| `client` | Real client | 1 | Fill the questionnaire. Upload KYC. Read documents. |

## 3. Day 0 (9 November): before the test

Do these steps in this sequence. Do not continue if a step fails.

| No. | Step | Pass condition |
|---|---|---|
| 0.1 | Make an RDS snapshot. Copy the S3 bucket to a backup prefix. | The snapshot status is "available". The copy count is the same as the source count. |
| 0.2 | Make a record of the open items: migrations 0035 to 0049 are not on RDS. | The list of pending migrations is in the deploy log. |
| 0.3 | Delete all data rows. Delete all S3 objects. Keep the schema and the one `super_admin` login. | Each data table has 0 rows. The `super_admin` login works. No demo login works. |
| 0.4 | Apply migrations 0035 to 0049 on RDS. | `drizzle` shows 50 migrations. No migration fails. |
| 0.5 | Set `CREDENTIALS_ENCRYPTION_KEY` on App Runner. | The portal credential page opens without an error. |
| 0.6 | Set `ASK_VCFO_ENABLED=true`. Set `WHATSAPP_ENABLED=true` only if the six templates are approved. | The flags show in the App Runner configuration. |
| 0.7 | Make sure SES is out of the sandbox. | An email goes to an address that is not verified. |
| 0.8 | Run `npm run check` on `main`. Deploy `main` to App Runner. | The gate passes. The deploy status is "SUCCEEDED". The logs show no errors. |
| 0.9 | Create the logins: 1 admin, 1 manager, 2 or 3 interns. Do not create the client yet. | Each person gets the welcome email. Each person signs in and sets two-step sign-in. |
| 0.10 | Each lead connects Outlook one time. | The Outlook status shows "Connected". |

## 4. Test plan for each feature

Severity: S1 = stops the workflow. S2 = wrong result, a workaround is possible. S3 = cosmetic.
Exit rule for each feature: 0 open S1 defects, and all S2 defects have an owner.

| ID | Day | Feature | Roles | Test steps (main flow) | Pass condition | Email and WhatsApp check |
|---|---|---|---|---|---|---|
| T-01 | 0 | Data reset and deploy | super_admin | Do steps 0.1 to 0.8. | All pages open for each role. No old data shows. | None |
| T-02 | 0 to 1 | Logins and roles | All | Each person signs in. Each person opens each page in the sidebar. Try to open a page of a different role. | Each person sees only the pages of their role. A wrong-role page redirects. Ten wrong codes lock the two-step sign-in. | Welcome email arrives. Password reset email arrives. |
| T-03 | 1 | Project creation | admin | Create the project for the real client. Set Dependent or Independent. Assign the manager and the lead. Invite the client. | The project shows on the admin, manager and lead dashboards. The client gets the invite and signs in. | Invite email arrives. Assignment emails arrive. |
| T-04 | 1 to 2 | Client questionnaire (Part A) | client, intern | The client fills Part A. The lead fills the missing fields. The lead submits. | The answers save. Required fields stop the submit if they are empty. The NIC code search works. | Manager gets the "step submitted" email. |
| T-05 | 2 to 3 | SPICe+ checklist (34 steps, Part B) | intern, client | The lead fills each Part B step: capital, office, directors, KYC and DSC. The client uploads KYC files. | The step gates open in the correct sequence. Uploaded files show in the Vault. Progress shows the same value for each role. | Client gets the document request email. |
| T-06 | 2 to 4 | Manager approvals | manager | Approve some steps. Reject one step. Request a change on one step. Approve from the bell and the dashboard. | A rejected step goes back to the lead. The client sees a step only after the manager accepts it. | Lead gets the reject email. Client gets the "approved and sent" email. WhatsApp nudge arrives if it is on. |
| T-07 | 4 | MCA document pack | intern, manager | Generate each incorporation document for each director. Download the ZIP. | Each .docx opens in Word. Names, addresses and capital agree with the answers. | None |
| T-08 | 4 | Board resolutions | intern, manager | Generate the board resolutions. Make a change and generate again. | The .docx opens. The date and parent entity data are correct. | None |
| T-09 | 5 | Incorporation close and post-incorporation | manager, admin | Enter the COI data (CIN, date). Move the project to Post-Incorporation. Do the post-incorporation steps. | The stage changes on each dashboard. The pre-incorporation notice goes away on the compliance pages. | Client gets the incorporation email. |
| T-10 | 5 | Board meetings | intern, manager | Create the first board meeting. The manager approves the notice. | The notice has a Word file and a Teams link. | Directors get the notice email. |
| T-11 | 6 | Registrations | intern, manager, client | Open Registrations. Start each registration the client needs (for example GST, PF, ESI, PT, Shops). Upload the certificate. | Each registration shows its status. The certificate shows in the Vault. The facts show in the compliance setup. | Client gets the request and the completion email. |
| T-12 | 7 | Compliance calendar and filings | admin, manager, intern, client | Open the calendar. Mark one filing as filed with proof. Make one filing overdue on purpose (test date). | Due dates agree with the CIN date and the registrations. Status and colour agree for each role. | Reminder email arrives on the reminder day. Overdue bell shows. WhatsApp reminder arrives if it is on. |
| T-13 | 8 | Labour registers | intern, manager, client | Upload the employee data. Generate the registers for one month. Close the month. | Each register downloads. The data agrees with the upload. The client sees the registers in the portal. | Client gets the "registers ready" email. |
| T-14 | 8 | Payroll | intern, manager, client | Add salary updates. Open the payroll summary for one cycle. Compare with the labour registers. | The totals agree with a manual calculation. The client sees only their own payroll. | None |
| T-15 | 9 | Budgets | intern, manager, client | Create a budget. Import the actual values. Open the variance report. Export to Excel and PDF. | The variance agrees with a manual calculation. The Excel and PDF files open. | Client gets the budget email. |
| T-16 | 9 | Ask VCFO (chatbot) | intern, client | Ask 10 real questions: 5 about the project, 5 about compliance law. A lead pastes details and accepts one review card. | Answers use only the data of the same client. A wrong client name gets no data. The accepted card changes the correct field. | None |
| T-17 | 1 to 10 | Email | All | Make a list of each email the test sends. Compare the list with the events in this table. | Each event sends one email to the correct people. No email goes to a wrong client. Links open the correct page. | — |
| T-18 | 1 to 10 | WhatsApp | All | Set consent for each person. Do one event of each of the six templates. Set the kill switch, then do one event. | Each nudge arrives. With the kill switch on, no nudge goes and the email still goes. | — |
| T-19 | 10 | Regression and sign-off | All | Do T-02 to T-06 again quickly. Do the cross-role check: the client must not see staff-only data. Close the defect list. | Exit rule passes for each feature. The owner signs off. | All earlier emails still arrive. |

## 5. Daily schedule

| Day | Date | Features | End-of-day output |
|---|---|---|---|
| 0 | 9 Nov | T-01, T-02 (staff), setup | Clean production, staff logins work |
| 1 | 10 Nov | T-03, T-02 (client), start T-04 | Project created, client signed in |
| 2 | 11 Nov | T-04, T-05 | Part A submitted |
| 3 | 12 Nov | T-05, T-06 | Part B half done, approvals tested |
| 4 | 13 Nov | T-06, T-07, T-08 | Pre-incorporation closed, documents downloaded |
| 5 | 14 Nov | T-09, T-10 | Project in Post-Incorporation |
| 6 | 15 Nov | T-11 | Registrations started |
| 7 | 16 Nov | T-12 | Compliance calendar checked |
| 8 | 17 Nov | T-13, T-14 | Registers and payroll checked |
| 9 | 18 Nov | T-15, T-16 | Budget and chatbot checked |
| 10 | 19 Nov | T-17, T-18 summary, T-19 | Sign-off or go-live delay decision |

## 6. Defect log (use one row for each defect)

| Defect ID | Test ID | Date | Role | Page URL | Steps | Expected result | Actual result | Severity | Owner | Status |
|---|---|---|---|---|---|---|---|---|---|---|

## 7. Risks

| Risk | Effect | Action |
|---|---|---|
| The data delete cannot be undone. | All old data is lost. | Do step 0.1 first. Keep the snapshot for 30 days. |
| Migrations 0035 to 0049 are not on RDS. | Receivables, labour registers, budgets and Ask VCFO pages fail. | Do step 0.4 before the deploy. |
| `CREDENTIALS_ENCRYPTION_KEY` is not set. | Portal credential features fail. | Do step 0.5. |
| SES is in the sandbox, or WhatsApp templates are not approved. | Emails or nudges do not arrive. | Do steps 0.6 and 0.7. Test WhatsApp only if the templates are approved. |
| Real client steps take longer than one day. | The schedule slips. | Do the post-incorporation tests on a second test project with test data, in parallel. |
| Real dates do not make a filing due in 10 days. | T-12 reminders are not tested. | Use the second test project with a past CIN date. |
