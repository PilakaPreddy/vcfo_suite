# Open questions for MCA filing and VCFO Assist

Status on 9 November 2026. The wording follows ASD-STE100 rules, but nobody checked it against the official dictionary. This is not legal advice. The IDs come from `ASSIST-ARCHITECTURE.html` and the plan in the session notes.

**Rule:** Nothing must be illegal. A written CS or counsel opinion decides. If an answer is not clear, treat the method as prohibited.

## 1. Questions for the CS or counsel

Send these with Appendix A and the September 2026 log. The live portal work (P4 to P7) waits for these answers.

| ID | Question | Why we ask | Blocks |
|---|---|---|---|
| B1 | Does the MCA website policy permit software that acts for an authorised user in that user's own session? | The policy prohibits unauthorised use. It does not mention this case. | All live work |
| B2 | May a firm or a vendor keep a client's or a professional's MCA login? | Some vendors keep logins. We found no MCA position. | Vendor route |
| B3 | May software click final submit after a professional approves the form? | Today a person clicks it. | Later automation |
| B4 | May firm staff operate a director's DSC with consent? | IT Act s.66C penalises fraudulent use. ICAI holds the DSC owner responsible. | Signing design |
| B5 | What must the certifying professional check in person? | A 2026 ICAI order found misconduct for certification without checks. | Review step |
| B6 | Which authorisation letter or engagement clause do we need from clients? | We must have a written basis for this work. | Client terms |
| B7 | Who is liable when software enters a wrong value? | Companies Act ss.7 and 448 can apply. | Release |
| B8 | Which DPDP Act consents apply to director data that a vendor or agent receives? | Personal data can leave the firm. | Vendor route |
| B9 | Has MCA taken action against a software filing tool? | We found no case. | Risk level |
| B10 | Do ICSI or ICAI rules limit delegated filing? | Staff can prepare forms for a professional. | Staff roles |
| B11 | Is the webform submit before DSC a legal filing act? May software click it after a professional approves? | It generates an SRN before signature and payment. | Later automation |
| B12 | Does the September 2026 scripted capture on a logged-in session need an action from us? | The log records two clicks on a control named Submit. We do not know who clicked or what was filed. | Capture folder, MCA letter |
| B13 | Does the "Professional Staff Member" role let staff work for a professional with no shared password? | The MCA DSC page names this role. | Staff access |
| C4 | Which login must file: the professional's or the client's? | The same login must file Part A, Part B and the linked forms. | First live run |
| E1 | Who signs each form, and in which order? | Directors and the professional sign. | Signing queue |
| E5 | Does MCA accept a DSC in a remote signing service, or an Aadhaar-based signature? | One guide says no eSign. The consultation lists Aadhaar OTP. | Signing design |
| N1 | May a person, logged in to their own account, run a read-only tool that saves the form structure with values removed? | The capture kit does this. It also saves option lists, which can hold names. | P4 capture |
| N2 | May the extension read the form's own record through the page's guideBridge API? May it later set values that way? | It shows whether a value reached what the form will submit. | Form record check |
| N3 | May we keep copies of portal page markup on a firm laptop for offline tests? | The offline tests use the September pages. | Offline tests |

## 2. Questions for you (the owner)

| ID | Question | Why we ask | When |
|---|---|---|---|
| O1 | `vcfo_assist` is a public GitHub repository. Do you make it private before the first push? | A push publishes the field maps and the code. | Before any push |
| O2 | Did you restrict the capture folder and sign out of MCA? | The folder holds browser `Cookies` and `Login Data` files. | Now |
| A1 | Which actions must a person keep? How many person actions for each filing are acceptable? | This sets the goal. | Before P5 |
| A2 | How many SPICe+ filings does SBC do each month? | This decides build or buy. | Now |
| A3 | Is this for SBC only, or a product for other firms? | A product has more risk. | Now |
| A4 | Which company types are in version 1? Only private limited? | Other types change the forms. | Before P5 |
| A5 | Do we include more than 7 subscribers, more than 20 signers, foreign subscribers or Section 8 companies? | These change the forms. | Before P5 |
| A6 | Do other forms (AOC-4, MGT-7, DIR-12) follow later? | This decides what to make general. | Later |
| A7 | What is the target: minutes for each filing, or fewer resubmissions? | This sets the pass limit. | Before P5 |
| A8 | What are the budget and the date? | This sets the plan. | Now |
| C12 | Which phone and email get the OTP? Who is available at filing time? | A missed OTP stops the run. | Before P5 |
| E2 | Are the DSC tokens at SBC or with the directors? | This decides the signing queue. | Before P7 |
| E4 | Which operating system do the signers use? | Signing tools differ. | Before P7 |
| F1 | Who pays the fees, the firm or the client? Which payment method? | A person pays on the portal. | Before P7 |
| G3 | Which results go into Suite: CIN, DIN, PAN, TAN, COI? | This decides the filing record. | Later |
| I2 | Who repairs the system near a filing deadline? | The portal can change. | Before release |
| I8 | Does the Suite credentials store hold any MCA login? Who can read it? | "No credentials" is true only for the extension. | Now |
| T1 | Which three filings do we time? Who records the stages? | We have no baseline. | During normal work |
| T2 | Which real planned filing is the first live test? Did the client give consent? | Track 2 needs true data and consent. | Before P4 |

## 3. Questions only the first live run can answer

These need written CS approval first. A person logs in. The run stops before submit.

| ID | Question | What we do now | How we find out |
|---|---|---|---|
| L1 | Do native events alone put the value in the form's record? | Native is the default. `both` stays available. | Fill Part A. Read the form record. |
| L2 | Does the form node id equal guideBridge's node id? | A field that does not match is not compared. | Compare the ids on one form. |
| L3 | Is a 30 ms pace acceptable? How long do the form's rules take? | 30 ms, and 400 ms quiet after a trigger field. | Time one Part A fill. |
| L4 | Does the form check stop a run on a real form when nothing changed? | It pauses on any changed label, control or fixed option. | Run it on the live form. |
| C5 | Does an OTP appear at each login? | A person types it. | Log in. |
| C6 | How long does a session last? Does it survive a long Part B fill? | A lost session stops the run. A rerun leaves filled fields alone. | Fill Part B. |
| C8 | Does fast filling cause a lock or a rate limit? | The pace is slow on purpose. | Watch the first fills. |
| C11 | Can a person delete a test draft? Does a draft make a record? | We use only a real planned filing. | Ask the CS, then test. |
| D3 | Does the portal make INC-9 by itself? | INC-9 has no bindings. | Open it on a real filing. |
| D4 | Do eMoA and eAoA fill from Part B? | Their maps are small. | Open them on a real filing. |
| D6 | Can the extension attach files to these upload controls? | Two upload steps exist. | Attach on Part B. |
| D7 | What do we do with Auto Check results on Part A? | The run stops and shows the lead. | Run Auto Check. |
| D10 | Do the OTP fields inside Part B and AGILE-PRO-S stop a run? | The guard refuses them. A person fills them. | Fill both forms. |
| E3 | Does the portal accept a PDF signed outside Adobe? | Signers use Adobe. | One safe test, if the CS approves. |

## 4. Defaults I chose that you can change

| No. | Default | Reason | Where |
|---|---|---|---|
| Q47 | Native events only, with `both` as a setting | `both` ran each rule two times on the stand-in form. | `QUESTIONS.md` |
| Q48 | The form record check calls only `isConnected` and `visit`, and it is off until a person ticks CS approval | `validate` can paint errors on the form. | `QUESTIONS.md` |
| Q49 | A value aimed at a box that two map entries name goes to a person | A row added on the form moves the count. A wrong box looks correct to the read-back. | `QUESTIONS.md` |
| Q50 | An interrupted fill continues by itself | A field that holds its value is left alone. | `QUESTIONS.md` |
| D1 | Required fields left for a person lock review until the person ticks that they filled them | A skipped required field must not pass silently. | Panel 3 |
| D2 | Extension permissions name only `*.sbctrack.in` and localhost | Less access is safer. | `manifest.json` |
