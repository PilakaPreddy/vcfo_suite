# VCFO Assist Agents — questions for the company secretary

This is the question bundle that phase 0 of `ROADMAP.md` sends to the company secretary (or
counsel). Part A is taken from the eleven open questions at the end of the firm's legal report
(`docs/specs/mca-connect/reports/MCA SPICe filing automation options.md`). Part B adds questions
that only arise from the design in `PLAN.md`. The guards the answers rely on are in `SAFETY.md`.

Fill in the bracketed parts, attach the report and `SAFETY.md`, and send the letter as it stands.

---

**To:** [Name], Company Secretary [or counsel], [membership number]
**From:** [Name], [role], SBC
**Date:** [date]
**Subject:** Written opinion requested on VCFO Assist, an attended form-filling aid for MCA V3

Dear [Name],

SBC is building VCFO Assist, a Chrome extension that helps our own staff fill MCA V3 web forms,
starting with SPICe+ Part A, from data the firm already holds in VCFO Suite. The extension runs
only in the staff member's own browser and in the session they have opened themselves. A person
always logs in, types the captcha and OTP, signs with their own DSC, clicks the final Submit and
pays the fee. The extension never does any of these, stores no credentials and calls no portal
endpoint. Until now we have built and tested it only against a local copy (mock) of the forms;
it has never touched the live portal.

Our internal rules say that no tool may touch the live MCA portal before a written CS opinion,
and that any unclear position counts as prohibited. We would be grateful for a written answer to
each question below. Where the answer is "it depends", please tell us the conditions, and the
records you would expect us to keep. A short answer per question is enough.

### Part A — general questions from our legal research

1. **MCA terms of use.** Do the full MCA V3 Terms and Conditions, the Website Policy and any
   section-specific terms allow, or bar, automated or assisted form filling in a user's own
   session? (Our research could not read the full text.)
2. **Protected system.** Is MCA21 notified as a "protected system" under section 70 of the IT
   Act? If so, what does that change for a tool that fills fields in an attended session?
3. **Approval for a first live filing.** Will you give written approval for VCFO Assist's first
   live filing? If so, on what scope (which forms, which staff members, how many filings) and with
   which logs?
4. **MCA notices.** Has MCA issued any circular, notice or advisory since 2019 on third-party
   filing software, browser extensions, bots or misuse of user IDs? (We found only anti-phishing
   advisories.)
5. **Authority to file.** What authority must a staff member hold to file a client's SPICe+
   under their own Business User ID, and what document should we keep as proof of it?
6. **DSC custody.** May the firm keep a client's DSC token in its office with the client's
   written consent, if only the client types the PIN? (The CCA text says the token stays in the
   subscriber's custody.)
7. **Other ways of signing.** Does MCA accept Aadhaar eSign, a cloud or HSM DSC, or a PDF signed
   in Leegality or emSigner, for SPICe+ or for its attachments? (Only vendor claims exist, and we
   cannot test this on the live portal.)
8. **Review evidence.** When a tool pre-fills SPICe+, what review evidence must the certifying
   professional keep to meet sections 7(6) and 448 and the institutes' due-diligence standard?
9. **Paying the fee.** May the firm pay a client's SRN fee from the firm's own account?
10. **Data protection.** Which DPDP Act sections and Rules bind the firm now? Does any rule
    restrict sending director data to a vendor hosted outside India? Is the section 3(c)(ii)
    exemption safe to rely on for data taken from MCA registers?
11. **Statute texts.** What do sections 447 (Companies Act) and 72A (IT Act) say in their
    current text, including the fine under 72A, and what limits does section 29 of the Aadhaar
    Act set on storing or sharing Aadhaar numbers?

### Part B — questions specific to the VCFO Assist design

12. **Attended filling in the user's own session.** The staff member opens the MCA portal, logs
    in with their own Business User ID, and types the captcha and OTP. The extension then types
    values into the visible form fields, the same fields the person would type into, after the
    person has seen and confirmed a table of every value it will write. Is this lawful use of the
    portal "with permission", and does it change who is responsible for the content?
13. **Clicks the agent makes.** Apart from typing into fields, the extension clicks only three
    kinds of button: **Save draft**, **Check form** (the portal's own validation) and **Download
    PDF**. It never clicks Login, the final Submit, any payment button, or the DSC signing
    controls. Are these three clicks acceptable? Should any of them stay with the person?
14. **Attaching a signed PDF.** Each signer signs the MCA-generated PDF on their own token. The
    staff member then drops that signed PDF into the extension's panel, and the extension attaches
    it in the portal's upload field without changing a byte. Is it acceptable for the extension to
    perform the upload step, given that a person still clicks the final Submit?
15. **Reading the SRN.** After the person submits and pays, the extension reads the SRN shown on
    the portal page and writes it back to the client's file in VCFO Suite, so that our reminders
    for the 15-day and 7-day limits start. It reads nothing else and calls no portal endpoint. Is
    reading the SRN off the screen acceptable?
16. **Field labels sent to an AI model.** When the portal changes a form and the extension cannot
    find a field, it may send the field **labels** on that page (for example "Proposed name 1",
    "NIC code") and our own field names to an AI model, which picks the matching field from a
    list. No client values are sent: no names, PAN, addresses, numbers or screenshots, and the
    captcha is never read. The model is Anthropic's Claude Haiku, reached either through
    Anthropic's API (hosted outside India) or through AWS Bedrock ([region, for example
    ap-south-1 Mumbai]). Does sending labels only, with no client values, need a DPDP processor
    contract, a client notice, or a particular hosting region?
17. **Screenshots and logs.** For each run, VCFO Suite keeps a log of every field filled, every
    refusal and every human step, with who prepared, who reviewed and who signed. It can also keep
    a screenshot of a portal page at chosen steps, stored on the firm's own AWS account in India.
    Is this the right record for question 8? How long should we keep it, given the CERT-In
    180-day rule?
18. **Learning the forms.** To build our mock of the forms, a staff member files as usual while a
    passive recorder extension notes the structure of each page (field names, labels, buttons). It
    stores no values, passwords or request bodies. Is that acceptable on the live portal?
19. **Other portals.** If the answers above are favourable for MCA, may the same design be used
    on gst.gov.in, udyamregistration.gov.in, dgft.gov.in and state portals, or does each portal
    need its own review of its terms?

We would be grateful for your answer by [date]. Until we receive it, the extension stays
switched off for every live portal, and we continue testing only against the mock.

Yours sincerely,
[Name]
[Role], SBC

Enclosures: the legal report on SPICe+ filing automation options; the VCFO Assist safety guards
(`SAFETY.md`).

---

## After the reply

| Step | Who | Where |
|---|---|---|
| Record the opinion's date, author, scope (forms, users, hosts) and conditions. | Super admin | Suite, live-portal switch (see `SAFETY.md`, G11) |
| Turn any condition into a guard, a test or a log field before the switch is turned on. | Developer | `SAFETY.md`, the guards module |
| Move phase 4 of `ROADMAP.md` from blocked to ready, or record why not. | Owner | `ROADMAP.md` |
