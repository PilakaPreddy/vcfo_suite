# Plan v3: All ways to connect VCFO Suite to the MCA portal for SPICe+

Status: **Track 3 code built offline on 5 November 2026 at the owner's request. Nothing is committed or deployed, and nothing has run on the live MCA portal.** Live use still waits for written CS approval. The drafts in the appendices are not sent. Wording follows ASD-STE100 rules, but I did not check it against the official dictionary. This is not legal advice.

## 1. Context

| Item | Statement |
|---|---|
| Problem | Staff enter SPICe+ data in VCFO Suite, then enter the same data again in the MCA portal. |
| Goal | Staff enter data one time. The system does all other portal work that the law and MCA permit. |
| Correction to plan v1 | Plan v1 said that most tools leave login to a person. That is wrong. ComplyRelax, Gen CompLaw and Leagully keep MCA logins and act on the portal. |
| Main finding | Leagully's video shows a person giving the OTP and uploading the DSC-signed form. ComplyRelax and Gen CompLaw materials do not show how they handle OTP. H4 and H6 test this. |
| Existing work | `vcfo_assist` holds generated maps for six forms. Nobody has tested it on the live portal. |

## 1.1 Owner rule: nothing illegal

This rule overrides all other parts of this plan. This plan cannot certify that a method is legal. A written CS or counsel opinion decides.

| Class | Approach | Rule |
|---|---|---|
| Permitted now | Staff enter data by hand on the portal. Suite copy panel. Suite checks with no portal access. | Keep normal consent and professional checks. |
| Hold until written CS approval | Extension fill in the user's own session, `guideBridge` read, webform submit by software, any live portal test, vendor or agent with a stored login. | Do not use on the live portal before approval. |
| Prohibited | Captcha or OTP bypass. Use of another person's login or DSC without valid authority and control. Signing for a signer. False or test data on the portal. Calls to private portal endpoints. Personal data sent to a vendor with no valid basis. A professional certifying with no checks. | Do not plan or do these. |

If the opinion is unclear, treat the method as prohibited. Stop at once if MCA or a CS raises a concern.

## 1A. Improvements added in v3

| No. | Improvement | Reason | Where |
|---|---|---|---|
| 1 | Replace the proposed `mca_filings` table with the existing `assist_runs` table and routes. | Suite already has `src/db/schema-portal-compliances.ts` (`assistRuns`) and `app/api/assist/engagements/[id]/runs/`. The `vcfo_assist` status note is out of date. | Track 3, section 7 |
| 2 | Separate webform submit from legal filing. | The MCA steps put webform submit before DSC, upload and payment. Each form has its own submit. | B11, section 4 |
| 3 | Count person actions per filing. Remove "four clicks". | The real count depends on signers, forms and B11. | A1 |
| 4 | Tell the CS about the September 2026 capture. | Scripts drove a logged-in portal session. The log also records two clicks on a control named Submit. I did not establish who clicked or what they filed. | B12, Appendix A |
| 5 | Secure the capture folder. | `reference/vcfo_assist/mca-capture/profile` holds browser `Cookies` and `Login Data` files, and the folder is group-writable. I did not open these files. | Step 1.0 |
| 6 | Find out whether Suite holds MCA logins. | Suite has an encrypted client portal login store. Its key is not set on App Runner. "No credentials" is true only for the extension. | I8 |
| 7 | Measure the current process first. | The plan has no baseline. The main delay may be data and signature follow-up, not typing. | Step 1.1 |
| 8 | Examine no-portal features first: filing readiness, signer readiness, SRN and name deadlines. | They help on every route and need no portal access. | Section 6A |
| 9 | Keep one route-neutral filing packet: profile, attachment list, signer list. | A route change then costs less. `src/lib/assist-profile/` is the start. | Section 6A |
| 10 | Compare the portal PDF with Suite data before anyone signs. | The signer signs the PDF, not the Suite record. | D12, section 4 |
| 11 | Block upload of a signed PDF from an older form version. | An edit requires new PDFs and new signatures (FAQ 33). | E8 |
| 12 | Test the portal's AEM `guideBridge` as a read-only check. | The string is in 130 captured pages. `vcfo_assist` does not use it. It may be more stable than page selectors. | D11 |
| 13 | Plan for session loss. Save each section and resume. | A long Part B fill can outlast a session (C6). | Track 3 |
| 14 | Set live-test rules. | MCA has no known test environment. False data on a statutory portal can be a risk. | Track 2 |
| 15 | Set pass and stop limits and a vendor score. | The gate had no numbers. | Section 6B, Appendix C |
| 16 | Rank the questions and set a time box. | 81 questions cannot all come first. The MCA reply must not block other work. | Section 5A, 6B |
| 17 | Send the MCA letter only after CS review. Use the published contact route. | The letter describes the firm's plans to its regulator. | Appendix B |
| 18 | Examine the MCA "Professional Staff Member" role. | The MCA DSC page names it. It may give staff access with no shared password. | B13 |
| 19 | Record each MCA remark and cause. | Rejections can become new Suite checks. | G4 |
| 20 | Add a vendor exit plan and a yearly review. | The consultation may change DSC and filing rules. | I7, I9 |

## 2. How the market does this

"Seen" means a vendor page, video or MCA document shows it. "Inference" is my conclusion.

| Tool | Method | Login and OTP | SPICe+ | Evidence |
|---|---|---|---|---|
| ComplyRelax | Cloud app plus a Windows "MCA client agent". The agent installs with admin rights and connects to a gateway. | User adds MCA ID and password. OTP handling not shown. | Not confirmed. | Seen in 2026 help videos. |
| Gen CompLaw (SAG) | Desktop software. It saves the form on the MCA portal under a selected MCA ID. The user previews and submits. | Software holds MCA IDs. | **Yes**, Part A and Part B. | Seen in SAG guide and product page. |
| Leagully | Cloud app. It submits in the background with stored MCA logins. | User types OTP in the app. | Not seen. It lists INC-22. | Seen in its DIR-12 video. |
| CSTrax | Fills forms. User submits on the portal. | User. | Not seen. | Seen. Direct filing is on its roadmap. |
| AutoROC | Makes PDF or JSON. User types the data in the portal. | User. | No. | Seen. |
| OneFinOps | Claims API submission for some forms. | Not stated. | Not seen. | Claim only. It shows no MCA document. |
| InstaFinancials | Uses client MCA logins for read-only work under agent terms. | Client passes OTP. | No filing. | Seen. It is a useful contract model. |

| Fact about signature and payment | Source |
|---|---|
| In Leagully, the form stops at "pending for DSC". The user uploads the signed form, then pays from the app. | Leagully video |
| On V3, the user affixes the DSC on the PDF, usually in Adobe Reader. emBridge is for DSC association. | MCA FAQ; WeeDoo guide (secondary) |
| Aadhaar eSign is not accepted for MCA filings. | eDarpan (secondary). Confirm in E5. |

**Inference:** The local agent can make portal calls from the user's PC. This can explain the design, but ComplyRelax does not state this.

**WARNING:** A product on the market does not prove that its method is lawful. I found no MCA approval for any of these tools.

## 3. All possible routes

| No. | Route | Automation | Main risk | Decision |
|---|---|---|---|---|
| R1 | Own Chrome extension in the user's logged-in session | Fills all forms. Person logs in. | Portal changes break selectors. | **Preferred if a build is ever approved.** The extension stores no credentials. |
| R2 | Buy a vendor tool. Staff use it beside Suite. | Vendor scope | Double entry remains. Vendor holds logins. | **See demos now.** Start a trial only after B2 and H3. |
| R3 | Suite sends data to a vendor (import file or API) | High, if the vendor permits it | Vendor dependency | **Ask vendors.** Best result if Gen CompLaw or ComplyRelax accepts data. |
| R4 | Own local agent drives a browser on the user's PC (ComplyRelax-type design) | Runs in background. Person gives OTP. | Windows install, admin rights, support load | **Hold.** Use only if volume and legal opinion support it. |
| R5 | Own cloud robot with stored logins (Leagully-type design) | Highest | Credential custody, possible IP blocks, legal exposure | **Hold.** Needs written legal approval. |
| R6 | Server calls private portal endpoints | High | 54 of 64 captured `/bin` posts carry opaque, apparently encrypted data. MCA does not document them. | **Reject.** |
| R7 | Official MCA filing API | Best | I found none. API Setu shows company data APIs only. | **Ask MCA in writing.** |
| R8 | NSWS (official second channel since October 2023) | Unknown | I found no public API. | **Examine** with one manual test. |
| R9 | Partner with a registration platform (IncorpX has API partner terms) | Their staff file | Fee per filing, loss of control | **Keep as fallback.** |
| R10 | Policy route: answer the 2026 MCA and IICA filing consultation | Long term | Slow and uncertain | **Do it.** Low cost. Ask for a filing API. |
| R11 | AI browser agent fills forms by reading the screen | Medium | Errors in statutory data | **Reject for filing.** Consider it to help repair selectors. |

## 4. Ways at each filing stage

| Stage | Possible ways | Recommended now |
|---|---|---|
| Client data | Suite checklist | Suite. Add missing fields. |
| Pre-check | Suite rules; company data API for existing DIN or CIN | Suite rules plus MCA FAQ 19 checks. |
| Login | Person; stored login in agent or vendor | Person, in own session. |
| Captcha and OTP | Person | **Person only. Do not bypass.** |
| Fill Part A, Part B, linked forms | Extension; agent; vendor | Extension. Compare values after fill. |
| Attachments | Extension from Suite storage; vendor | Extension. |
| Webform submit (each form, before DSC) | Person; software | Person, until the CS answers B11. |
| Generate PDFs | Portal, after submit | Extension saves PDFs to Suite. |
| Compare PDF with Suite | Suite reads the PDF; person reads the PDF | Suite shows differences. The professional approves. |
| Sign | S1 Adobe by each signer; S2 local signer tool, signer types PIN; S3 firm holds tokens and PIN is automated; S4 remote HSM; S5 Aadhaar OTP | **S1 first, then S2.** Reject S3 unless counsel approves. S4 needs MCA confirmation. S5 is only a consultation option. |
| Upload signed PDFs | Extension; person | Extension, after signature check. |
| Pay | Person in portal; vendor screen | Person. |
| Final submit | Person; software | Person, until counsel answers B3. |
| Track and resubmit | Extension reads "My Application"; vendor | Extension sends SRN and status to Suite. |

## 5. All questions

Owner = you. CS = your company secretary or counsel. Test = hands-on test. Vendor = demo answer.

### 5A. Answer these first

| Order | Questions | Why they come first |
|---|---|---|
| 1 | I8, B12 | They concern possible exposure today. |
| 2 | A2, A3, A4, E2 | They set scale, risk and signature design. |
| 3 | B1, B2, B3, B4, B11 | They decide which routes are permitted. |
| 4 | H1, H3, H4, H5 | They decide buy or build. |
| 5 | C4, C5, C11, B13 | They decide how a live test can run. |
| Later | All other questions | Answer them only if the selected route needs them. |

### A. Goal and scope

| ID | Question | Who | Known now |
|---|---|---|---|
| A1 | Which actions must a person keep, and how many person actions per filing are acceptable? | Owner | Open. Count them in step 1.1. |
| A2 | How many SPICe+ filings does SBC do each month? | Owner | Open. This decides build or buy. |
| A3 | Is this for SBC only, or a product for other firms? | Owner | Open. A product raises the risk. |
| A4 | Which company types are in version 1? Private limited only? | Owner | Open |
| A5 | Do we include more than 7 subscribers, more than 20 signers, foreign subscribers, Section 8? | Owner, CS | These change the forms (MCA FAQ 17, 18, 43). |
| A6 | Do other forms (AOC-4, MGT-7, DIR-12) follow later? | Owner | Open |
| A7 | What is the target: minutes per filing, or resubmission rate? | Owner | Open |
| A8 | What are the budget and the date? | Owner | Open |

### B. Law and permission

| ID | Question | Who | Known now |
|---|---|---|---|
| B1 | Does the MCA website policy permit software that acts for an authorised user? | CS | Policy prohibits unauthorised use and password misuse. It can block high automated access. It does not address this case directly. |
| B2 | May a firm or vendor hold a client's or professional's MCA login? | CS | InstaFinancials uses agent terms. No MCA position found. |
| B3 | May software click final submit after a professional approves? | CS | Open |
| B4 | May firm staff operate a director's DSC with consent? | CS | IT Act s.66C penalises fraudulent or dishonest use. ICAI held the DSC owner responsible for safekeeping. |
| B5 | What must the certifying professional check personally? | CS | A 2026 ICAI order found misconduct over INC-32 certification without proper checks. |
| B6 | Which authorisation letter or engagement clause do we need from clients? | CS | Open |
| B7 | Who is liable when automation enters wrong data? | CS | Open. Companies Act ss.7 and 448 to be confirmed. |
| B8 | Which DPDP Act consents apply to director data sent to a vendor or agent? | CS | Open |
| B9 | Has MCA acted against any software filing tool? | CS, vendors | I found no case. |
| B10 | Do ICSI or ICAI rules limit delegated filing? | CS | Open |
| B11 | Is webform submit before DSC a legal filing act? May software click it after a professional approves? | CS | Open. MCA steps put it before DSC, upload and payment. It generates an SRN. |
| B12 | Does the September 2026 scripted capture on a logged-in session need any action? | CS | Open. See Appendix A. |
| B13 | Does the "Professional Staff Member" role let staff work under a professional without a shared password? | CS, test | The MCA DSC page names the role. Its rights are not confirmed. |

### C. MCA portal access

| ID | Question | Who | Known now |
|---|---|---|---|
| C1 | Does MCA give a filing API or partner programme? | MCA | I found none. |
| C2 | What do the API Setu MCA APIs return? Are they usable? | Test | Company details. One undated DAKSH review criticised their quality. |
| C3 | Does NSWS file SPICe+ end to end? Does it reduce steps? | Test | It forwards to MCA. Its current process is not confirmed. |
| C4 | Which login files: a professional's or a client's? | CS | The same login must file Part A, Part B and linked forms (FAQ). |
| C5 | Does OTP appear at each login? Who receives it? | Test | The 2023 FAQ says OTP goes to the mobile and email of the business user. |
| C6 | How long does a session last? Does it survive a long fill? | Test | Open |
| C7 | Does the portal block cloud or foreign IP addresses? | Test | Direct fetches got HTTP 403 and a reader service got through. This is weak evidence. |
| C8 | Does fast filling trigger locks or rate limits? | Test | Open |
| C9 | How often do forms change? | Test | Open. Compare captures monthly. |
| C10 | Is there a test environment? | MCA | I found none. Test on drafts. |
| C11 | Can a test draft be deleted? Does it create any record? | Test | Open. Do this before any test. |
| C12 | Which phone and email receive the OTP? Who is available at filing time? | Owner | Open. A missed OTP stops the run. |

### D. Filling

| ID | Question | Who | Known now |
|---|---|---|---|
| D1 | Which of the 500 unbound Part B fields are real inputs? | Test, CS | Open. 610 of 1110 bound. |
| D2 | How do we make the 50 fragile Part B selectors stable? | Test | Capture again with filled repeat rows. |
| D3 | What must INC-9 fill, if the portal generates it? | Test | FAQ says auto-generated. Maps show 0 of 161 bound. **This may remove work.** |
| D4 | Do eMoA and eAoA fill from Part B? | Test | FAQ says object, subscriber and capital data auto-populate. |
| D5 | Which data does Suite not hold? | Test | Compare with `docs/00-profile-contract.md`. |
| D6 | Can an extension attach files to these AEM upload controls? | Test | Open. 20 uploads in Part B, 8 in AGILE-PRO-S. |
| D7 | How do we handle Auto Check results on Part A? | Test | FAQ lists three results. Stop and show the lead. |
| D8 | What happens if MCA rejects the name? | CS | Open. Add a new-name loop. |
| D9 | Editing submitted Part B discards linked forms (FAQ 33). Can we refill them with one click? | Test | Yes in design. This is a strong benefit. |
| D10 | Do OTP fields inside Part B and AGILE-PRO-S stop a run? | Test | Maps show 8 and 7 credential fields. |
| D11 | Does AEM `guideBridge` give a stable read-only view of form values? Does CS accept its use? | Test, CS | The string is in 130 captured pages. Not tested. |
| D12 | Can Suite read each generated PDF and compare it with its own data? | Test | Open. Text PDFs are likely readable. Not tested. |

### E. Signature

| ID | Question | Who | Known now |
|---|---|---|---|
| E1 | Who signs each form, in which order? | CS | Directors and professional sign (FAQ 19). All first signers must be Business Users. |
| E2 | Where are the tokens: at SBC or with directors? | Owner | Open. This decides the queue design. |
| E3 | Does the portal accept PDFs signed outside Adobe? | Test | Open. Needed for S2. |
| E4 | Which OS do signers use? | Owner | emBridge lists Linux. An ICSI note cited by WeeDoo says Windows 10. Test it. |
| E5 | Does MCA accept remote HSM DSC or Aadhaar eSign? | MCA, CS | One guide says no eSign. Consultation lists Aadhaar OTP as an option. |
| E6 | Can we check signer identity before upload? | Test | Open. Compare certificate name with the record. |
| E7 | Can Suite speed up Business User registration and DSC association? | Test | Only with reminders. Each person gives OTP and PIN. |
| E8 | How do we prove that a signed PDF matches the latest form version? | Test | Open. Compare file hash and content. |

### F. Payment and deadlines

| ID | Question | Who | Known now |
|---|---|---|---|
| F1 | Who pays: firm or client? Which payment method? | Owner | Open |
| F2 | Can Suite show the fee before payment? | Test | Capture shows `/bin/payment/getstampdutyfees`. Read the value on screen only. |
| F3 | Can Suite warn before SRN cancellation? | Design | Yes, in design. FAQ: 15 days to upload, 7 days to pay. |

### G. After filing

| ID | Question | Who | Known now |
|---|---|---|---|
| G1 | Can we read status safely from "My Application"? | Test | The page exists. Gen CompLaw and Leagully sync status. |
| G2 | Can resubmission remarks return to Suite? | Test | Gen CompLaw shows remarks. |
| G3 | Which results enter Suite: CIN, DIN, PAN, TAN, COI? | Owner | Open |
| G4 | Which MCA remarks caused resubmission in the last 12 months? | Lead | Open. Use them for Suite checks. |

### H. Vendor demo questions

| ID | Question | Vendor |
|---|---|---|
| H1 | Show a live SPICe+ Part A and Part B with linked forms. | All |
| H2 | What does the MCA agent do? Does it drive a browser or send requests? | ComplyRelax |
| H3 | Where do MCA passwords live: PC or cloud? How are they encrypted? | All |
| H4 | How do you handle captcha and OTP? Does a person act? | All |
| H5 | Can Suite send you data by API or import file? | All |
| H6 | Which steps still need the portal? | All |
| H7 | Show an MCA document that permits your method. | All |
| H8 | Has MCA blocked or warned you? | All |
| H9 | How fast do you fix a filing after a portal change? | All |
| H10 | What are the failure rate and the resubmission rate? | All |
| H11 | Do you work on Linux and on many PCs? | All |
| H12 | What are the price, contract, data location and security certificates? | All |

### I. Build or buy, security, operations

| ID | Question | Who | Known now |
|---|---|---|---|
| I1 | What is cheaper at our volume: license or upkeep? | Owner | Leagully ₹4,750 to ₹30,400 a year. SaaSworthy lists Gen CompLaw at about $106 to $212. |
| I2 | Who repairs the system on a filing deadline? | Owner | Open |
| I3 | What is the manual fallback? | Owner | Portal stays available. Keep drafts usable by hand. |
| I4 | Does the extension need a Chrome Web Store listing? | Owner | Private listing is planned. |
| I5 | Which audit log proves who did what? | CS | Open |
| I6 | How do we control the PCs that run this? | Owner | Open |
| I7 | How do we leave a vendor and keep our data? | Owner | Open. Suite stays the data owner. |
| I8 | Does Suite hold any MCA login in its credentials store? Who can read it? | Owner, developer | Open. Examine the `cin` row and `src/db/repositories/credentials/`. |
| I9 | Who reviews this plan each year, or when MCA changes the rules? | Owner | Open |

## 6. Procedure

### 6A. Options that need no portal access

These are design options only.

| Option | What it does | Existing start |
|---|---|---|
| Filing readiness | Shows each missing field, file and approval before portal work starts. | `src/lib/checklist/`, `missing` list in `src/lib/assist-profile/build.ts` |
| Signer readiness | Shows Business User status, DSC association, DSC expiry and director KYC for each signer. | Director records in Suite |
| Deadline alerts | Warns before name expiry and SRN cancellation. | Suite notifications |
| Filing packet | Puts profile, attachment list and signer list in one versioned record. | `src/lib/assist-profile/`, `spice-attachments` route |
| Rejection log | Records MCA remarks and turns repeat causes into checks. | `assist_runs`, checklist rules |

### 6B. Time box and limits

All times are my estimates. All limits are proposals for you to confirm.

| Period | Work | Rule |
|---|---|---|
| Week 1 | Steps 1.0 and 1.1. Answer section 5A order 1 and 2. | None. |
| Weeks 1 to 2 | Send Appendix A to the CS. | Hold Track 2 until the opinion arrives. |
| Weeks 2 to 3 | Vendor demos with Appendix C. | Use no real login. |
| Weeks 3 to 4 | Send Appendix B after CS review. Do Track 2 if the CS permits. | Do not wait for MCA to do other work. |
| Week 4 | Hold the decision gate. | Use the answers you have. Record the gaps. |

| Limit | Proposed value |
|---|---|
| Go: time saved per filing | At least 50% against the baseline |
| Go: wrong values that reach a signed PDF | 0 |
| Go: resubmission rate | Not higher than the baseline |
| Stop: portal change blocks filing | More than 2 working days, with no manual fallback |
| Stop: any MCA warning or account lock | Stop at once and call the CS |

### Track 1: Evidence (no code, run together)

| Step | Action | Owner | Done when |
|---|---|---|---|
| 1.0 | Examine who can open the capture folder. Sign out of MCA sessions. Change the MCA password if the CS or you think it is necessary. Move the folder to a restricted place. Do not delete it before B12 has an answer. | Owner | Access is restricted. |
| 1.1 | Time three filings by stage. Count person actions. Record the MCA remarks. Answer A1 to A8. | Owner, lead | The baseline and answers are recorded. |
| 1.2 | Give section B to a CS or counsel. | Owner | You have a written opinion. |
| 1.3 | Ask MCA about C1, C10 and E5 in writing. | Owner | You have a reply, or 30 days pass. |
| 1.4 | Send API and data-entry comments to the IICA consultation, if it is open. | Owner | Comments are sent. |
| 1.5 | Book demos with SAG, ComplyRelax and Leagully. Ask section H. | Owner | Each vendor has answers. |
| 1.6 | Do one NSWS test up to the first filing step. | Lead | C3 has an answer. |

**WARNING:** Do not put a real MCA password in a vendor trial before B2 and H3 have answers. Do not install a vendor agent on a firm PC with client data. Use a separate PC.

### Track 2: Portal tests with the existing extension (no new features)

Do this track only if you and the CS approve it after the opinion.

**CAUTION:** Use only a real planned filing with true data and client consent. Use the login of the person who is responsible. Do not click submit, sign or pay. Stop at the first warning.

| Step | Action | Owner | Done when |
|---|---|---|---|
| 2.1 | Answer C11 first. | Lead, CS | Draft risk is known. |
| 2.2 | Load `vcfo_assist` and fill Part A from Suite. Stop before submit. | Developer, lead | Acceptance list has results. |
| 2.3 | Record C5, C6, C8, D6 and D7. | Developer | Each has a test result. |
| 2.4 | Open Part B, eMoA, eAoA and INC-9 by hand on a real filing. Record what auto-fills. | Lead | D3 and D4 have answers. |
| 2.5 | Sign one PDF outside Adobe in a safe test, if CS approves. | Lead | E3 has an answer. |

### Decision gate

Read the rows in this order. Use the first row that applies. The gate gives a recommendation. It does not start a build.

| Order | Result | Recommendation |
|---|---|---|
| 1 | Counsel rejects software acting on the portal | Keep Suite as a preparation tool (section 6A). |
| 2 | Baseline shows that typing is a small part of the delay | Use section 6A first. Examine the portal work again later. |
| 3 | MCA gives a filing API | Plan for the API (R7). |
| 4 | Vendor meets Appendix C and accepts Suite data | Plan for R3: connector and tracking only. |
| 5 | Vendor shows SPICe+ with no data import | Compare double-entry cost with Track 3. |
| 6 | No vendor meets the need | Consider Track 3 (R1). |
| 7 | Volume is high and counsel approves stored logins | Examine R4 only after R1 runs well. |

### Track 3: Route R1 (code built offline, live steps open)

| Step | Action | Done when |
|---|---|---|
| 3.1 | Reuse `assist_runs` and its routes for run, SRN and mismatch records. Connect the extension to them. Add filing states only if needed. | Suite receives the SRN. Cross-tenant tests pass. |
| 3.2 | Complete Part B bindings from D1 and D2. Add only fields that testing confirms. | Generator reports 0 fragile fields. |
| 3.3 | Add an `upload` op limited to file inputs. Use `spice-attachments` as the source. | Portal accepts files. |
| 3.4 | Add the PDF comparison, signature queue, certificate check and version check. Start with S1. | Suite rejects a wrong signer and an old PDF. |
| 3.5 | Add filing states, person gates, SRN deadline alerts and an audit log. | A test run stops at each gate. |
| 3.6 | Add resume after session loss, refill after edit (D9) and resubmission support. | A run resumes from the last saved section. One resubmission works. |
| 3.7 | Compare the live form with the schema before each run. | A changed field stops the run. |
| 3.8 | File three real companies with a CS watching. Then release. | All three get a COI. |

## 7. Files for the later Track 3 option

| Area | Path | Change |
|---|---|---|
| Guard and ops | `vcfo_assist/src/shared/constants.js`, `src/engine/ops/` | Keep human boundary. Add `upload`. |
| Bindings | `vcfo_assist/legacy/extension/lib/mapping.js`, `tools/build-fieldmaps.mjs` | Add bindings and regenerate. |
| Return path | `vcfo_assist/src/worker.js`, `src/suite/client.js`, `vcfo-suite/app/api/assist/engagements/[id]/` | Connect to the existing `runs` and `result` routes. |
| Profile | `vcfo-suite/src/lib/assist-profile/` | Reuse. Add fields. |
| Validation | `vcfo-suite/src/lib/checklist/` | Reuse. Do not rewrite. |
| Attachments | `vcfo-suite/app/api/engagements/[id]/spice-attachments/` | Reuse. |
| Data | `vcfo-suite/src/db/repositories/assist-runs.ts`, `src/lib/assist-runs/` | Reuse. Add a migration only for a confirmed gap. |

## 8. Verification

| Test | Method | Pass condition |
|---|---|---|
| Research | Section 5A questions have an owner and a dated answer. | No open order 1 to 4 question blocks the gate. |
| Baseline | Compare any route with the three timed filings. | Section 6B limits are met. |
| Vendor claims | Watch a live filing, not slides. | Vendor shows each claimed step. |
| Code gate | `npm run check` in both repositories. | No errors. |
| Safety | Target submit, pay and DSC controls with a recipe. | Guard refuses each click. |
| Credentials | Examine storage, logs and requests. | No MCA credential appears. |
| Accuracy | Compare portal values with Suite after fill. | Zero differences. |
| Real filing | Run step 3.8. | MCA approves three filings. |

## 9. Limits of this research

| Limit | Effect |
|---|---|
| Reddit and Twitter channels are not connected. | I did not read those discussions. CAclubIndia results came through Exa. |
| ComplyRelax blocked page reading (Cloudflare). | ComplyRelax facts come from its videos and one earlier page read. |
| I tested no vendor. | Section 2 shows what they state, not what works. |
| Some sources are secondary or old. | The MCA FAQ is from 2023. Tests must confirm it. |
| Legal notes are not advice. | Section B needs a professional answer. |

## 10. Sources

MCA and government:
- [SPICe+ FAQ](https://www.mca.gov.in/content/mca/global/en/help-faq/faqs/company-services/incorporation/spiceplus-linked-filings.html)
- [SPICe+ FAQ PDF](https://www.mca.gov.in/content/dam/mca/pdf/SPICEplus-and-linked-filings-FAQs-V3-20230122.pdf)
- [DSC association FAQ](https://www.mca.gov.in/content/dam/mca/pdf/DSC-Association-FAQs-20230315.pdf)
- [DSC registration](https://www.mca.gov.in/content/mca/global/en/help-faq/faqs/dsc-services/dsc-registration.html)
- [MCA website policies](https://www.mca.gov.in/content/dam/mca/documents/Website_Policies.pdf)
- [MCA Grievance Cell contacts](https://www.mca.gov.in/content/mca/global/en/contact-us/grievance-cell.html)
- [MCA officials at headquarters](https://www.mca.gov.in/content/mca/global/en/contact-us/officials-at-head-quarters.html)
- [PIB, March 2026](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2236804&lang=1&reg=3)
- [IICA filing consultation](https://iica.nic.in/mcaeodbform/)
- [NSWS FAQ](https://www.nsws.gov.in/faqs)
- [API Setu blog](https://blog.apisetu.gov.in/benefits-of-api-setu-over-financial-technology/)
- [IT Act 2000](https://www.indiacode.nic.in/bitstream/123456789/13116/1/it_act_2000_updated.pdf)

Vendors:
- [ComplyRelax trial and agent video](https://www.youtube.com/watch?v=oo8MoTnszjU)
- [ComplyRelax agent install](https://www.youtube.com/watch?v=ThwGhRPug2M)
- [ComplyRelax add MCA users](https://www.youtube.com/watch?v=U5l3CeySp6Q)
- [ComplyRelax Annual Filing](https://complyrelax.com/AnnualFiling.php)
- [Gen CompLaw SPICe+ guide](https://blog.saginfotech.com/file-spice-plus-form-gen-complaw-software)
- [Gen CompLaw product](https://saginfotech.com/GenCompanye-filer.aspx)
- [Gen CompLaw price](https://www.saasworthy.com/product/gen-complaw-sw)
- [Leagully DIR-12 video](https://www.youtube.com/watch?v=pqrGucVC2u0)
- [Leagully pricing](https://leagully.com/pricing)
- [CSTrax comparison](https://cstrax.com/compare/gen-complaw)
- [AutoROC](https://autowhat.ai/autoroc)
- [OneFinOps](https://onefinops.com/in/mca-roc-filing/mca21-portal-integration)
- [InstaFinancials login terms](https://www.instafinancials.com/legal/MCA_Login_Authorisation.html)
- [IncorpX partners](https://www.incorpx.io/partner-with-us)

Signing, law and commentary:
- [emBridge](https://embridge.emudhra.com/)
- [emSigner remote signing](https://support.emsigner.com/types-of-esignatures/global/remote-signing)
- [WeeDoo emSigner guide](https://weedoo.in/blog/emsigner-for-mca-download-install-fix-dsc-signing-errors-v3-portal-2026)
- [eDarpan DSC and eSign](https://www.edarpan.com/blog/dsc-vs-aadhaar-esign-company-filings)
- [ICAI reprimand on DSC](https://taxguru.in/chartered-accountant/ca-reprimanded-misuse-dsc-mca-filing.html)
- [ICAI order DC-1891-2024](https://disc.icai.org/wp-content/uploads/2026/02/125.-DC-1891-2024_compressed.pdf)
- [TaxGuru on NSWS](https://taxguru.in/company-law/indias-ease-doing-business-mcas-nsws-integration.html)
- [DAKSH on MCA21 and API Setu](https://www.dakshindia.org/Technology-and-Analytics-for-Law-and-Justice/MCA21-Data-Wizard-Revamp)
- [CAclubIndia OTP thread](https://www.caclubindia.com/forum/mca-site-isn-t-sending-out-otp-607315.asp)

Local evidence: `reference/vcfo_assist/mca-capture` (network capture of 23 September 2026), `vcfo_assist/fieldmaps/*.json`, `vcfo-suite/src/db/schema-portal-compliances.ts`.

## Appendix A: Draft request to the CS or counsel (not sent)

**Subject:** Written opinion on software assistance for SPICe+ filing

Dear [Name],

[Firm legal name] is examining software that reduces double entry in SPICe+ filing. We have not decided to use any method. Please give a written opinion before we decide.

**Facts to examine**

1. VCFO Suite holds client incorporation data. A Chrome extension can fill MCA forms in a logged-in user session. It is not approved for filing.
2. In September 2026, recorder and drive scripts opened MCA forms in a logged-in browser session to capture form structure. The log records two clicks on a control named Submit. We will give you the log. Please advise if any action is necessary.
3. The capture folder holds browser session files and may hold personal data.
4. Suite has an encrypted store for client portal logins. We are confirming whether it holds any MCA login.
5. Vendors state that they keep MCA logins and act on the portal. We have not verified these statements.

**Models to assess**

| Model | Description |
|---|---|
| M1 | Extension fills forms. A person logs in, gives OTP, submits, signs and pays. |
| M2 | As M1, but software clicks webform submit after a professional approves. |
| M3 | A local agent or vendor keeps the login. A person gives OTP. |
| M4 | A cloud service keeps the login and acts in the background. A person gives OTP. |
| M5 | The firm keeps DSC tokens and software operates them. |

**Questions**

Please answer B1 to B13, C4, E1 and E5 from section 5 of the attached plan. For each model, please state:

- Permitted, permitted with conditions, or not permitted.
- The Act, rule, policy or order you rely on, including Companies Act sections 7 and 448, the Companies (Incorporation) Rules 2014, the IT Act and the DPDP Act.
- The consent, authorisation letter or engagement clause we need.
- What the certifying professional must check personally.
- Whether you recommend that we write to MCA, and whether you can review our letter.

Regards,
[Name, designation, firm]

## Appendix B: Draft letter to MCA (not sent, CS must review first)

Route to confirm before sending: MCA Grievance Cell page lists Helpdesk (`Appl.Helpdesk@mca.gov.in`) and the e-gov Deputy Director (`ddegov@mca.gov.in`).

**WARNING:** Do not add any statement that no automation has been used. Fact 2 in Appendix A (question B12) must have an answer first.

**Subject:** Request for guidance on third-party software support for SPICe+ filing on MCA V3

To: The Deputy Director (e-Governance), Ministry of Corporate Affairs

Sir or Madam,

We are a professional firm that assists companies with incorporation. We want to reduce data-entry errors in SPICe+ and its linked forms. Please give guidance on these points:

1. Does MCA offer a filing API or partner programme for SPICe+ and linked forms? If yes, how can a firm apply?
2. Does MCA offer a test environment for software providers?
3. May a business user use software, in their own logged-in session, to enter data in web forms? The user stays responsible for the data, signature, payment and submission.
4. Does the "Professional Staff Member" role permit staff to prepare forms for a professional? What are the conditions?
5. Does MCA accept a DSC held in a remote signing service? Does MCA accept any Aadhaar-based signature for these forms?
6. Which published policy or circular applies to these points?

We do not ask for any change to a filing. Please advise if another office must answer this request.

Yours faithfully,
[Name, designation, membership number, firm, contact details]

## Appendix C: Draft vendor request and score sheet (not sent)

**Subject:** Request for a live demo of SPICe+ filing

Dear [Vendor] team,

We are a professional firm examining tools for SPICe+ and linked forms. Please book a 45-minute demo. We ask you to show a live filing flow, not slides. We will not enter a real MCA login or client data in this demo. Please also answer the attached questions in writing.

Regards,
[Name, firm, contact details]

**Attached questions:** H1 to H12 from section 5.

**Added questions by vendor**

| Vendor | Question |
|---|---|
| ComplyRelax | Does your MCA client agent support SPICe+? Does it run on Linux? Why does it need admin rights? What does it send to your gateway? |
| Gen CompLaw | Is the SPICe+ flow current on V3? Does it fill linked forms? Where does the software keep MCA IDs? Can it import data from a file? |
| Leagully | Do you support SPICe+ and linked forms? What does "DSC vault" store? Do you ever hold the physical token or the PIN? |

**Pass or fail (a fail ends the review)**

| No. | Must have | Result |
|---|---|---|
| 1 | Shows SPICe+ Part A, Part B and linked forms live | |
| 2 | States in writing where logins are stored and who can read them | |
| 3 | A person keeps OTP and signature consent | |
| 4 | Does not bypass the captcha | |
| 5 | Lets us export all our data | |

**Score (1 to 5, proposed weights)**

| Item | Weight | ComplyRelax | Gen CompLaw | Leagully |
|---|---|---|---|---|
| Accepts Suite data | 25% | | | |
| Reduces person actions | 20% | | | |
| Security and contract | 20% | | | |
| Speed of repair after a portal change | 15% | | | |
| Status and remarks return to Suite | 10% | | | |
| Yearly cost at our volume | 10% | | | |
