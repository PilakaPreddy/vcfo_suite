# Indian data-protection law for SBC's VCFO Suite, VCFO Assist extension and AI features (position as of 10 November 2026)

Scope: DPDP Act 2023, DPDP Rules 2025, Aadhaar Act 2016 and UIDAI regulations and circulars, CERT-In Directions of 28 April 2022, IT Act s.43A, s.72A and the SPDI Rules 2011, and CA/CS professional confidentiality. The setup: client company and director data (names, PAN, DIN, masked or full Aadhaar, addresses, email, phone, ID proofs) held in VCFO Suite on AWS ap-south-1. A Chrome extension moves it into MCA forms. The form resolver sends labels only to Claude (Anthropic API or Bedrock). "Ask VCFO" may send real client data to Anthropic.

This builds on, and partly corrects, the DPDP rows in `docs/specs/mca-connect/reports/MCA SPICe filing automation options.md` and guard G9 in `docs/specs/vcfo-assist-agents/SAFETY.md`. Each point that reconciles with those files is labelled "Reconciliation". Items marked "background knowledge, not verified this session" come from the researcher's training data. No source was fetched for them, so they must be checked against the bare act before anyone relies on them.

## 1. DPDP Rules 2025: notification, phased commencement, and the Data Protection Board

### Takeaway
The Rules were notified on 13 November 2025. Sources differ by a day, and some say 14 November. Only definitions and the Board machinery are in force now. Consent Manager registration (Rule 4) starts around 13 November 2026. Almost every duty that binds SBC (notice, consent, legitimate uses, security, breach notice, retention, processor contracts, cross-border, rights, penalties) starts around 13 May 2027. MeitY floated cutting the 18 months to 12 in January and February 2026, but no amendment notifying that cut was found. The Board exists in law, but as of September 2026 it had no Chairperson or Members.

### Cited Findings
- The Rules were notified on 13 November 2025 and take effect in three tranches ([AZB & Partners](https://www.azbpartners.com/bank/indias-digital-personal-data-protection-act-phased-rollout-and-key-compliance-milestones/); [Mondaq](https://www.mondaq.com/india/data-protection/1708164/digital-personal-data-protection-rules-2025-notified)). Some reports date it 14 November 2025 ([The Week/PTI](https://www.theweek.in/wire-updates/business/2025/11/14/del148-biz-dpdp-rules-ld-govt.html)).
- **Immediate (13 Nov 2025):** Act s.1(2), s.2, s.18–26, s.35, s.38–43, s.44(1) and (3); Rules 1, 2 and 17–21. These cover definitions and the Board's constitution and working ([AZB](https://www.azbpartners.com/bank/indias-digital-personal-data-protection-act-phased-rollout-and-key-compliance-milestones/)).
- **12 months (AZB says 12 Nov 2026; others say 13 Nov 2026):** Act s.6(9) and s.27(1)(d); Rule 4, Consent Manager registration ([AZB](https://www.azbpartners.com/bank/indias-digital-personal-data-protection-act-phased-rollout-and-key-compliance-milestones/)). Rule 4 sets up registration and does not oblige ordinary fiduciaries to route consent through a Consent Manager ([summary of search results incl. MojoAuth](https://mojoauth.com/blog/india-dpdp-consent-managers-november-2026)).
- **18 months (AZB says 12 May 2027; most say 13 May 2027):** Act s.3–5, s.6(1)–(8) and (10), s.7–17, s.27 (except 27(1)(d)), s.28–34, s.36–37, s.44(2); Rules 3, 5–16, 22 and 23. These cover notice, consent, legitimate uses, fiduciary duties, children, rights, cross-border transfers and the Board's powers, including penalties ([AZB](https://www.azbpartners.com/bank/indias-digital-personal-data-protection-act-phased-rollout-and-key-compliance-milestones/)).
- In January 2026 MeitY sought industry views, due by 4 February 2026, on cutting the fiduciary compliance window from 18 to 12 months. It also floated running Rule 8(3) within three months and putting SDF duties (Rule 13) on 12 months ([Storyboard18](https://www.storyboard18.com/digital/meity-seeks-industry-views-on-fast-tracking-dpdp-act-rollout-proposes-12-month-compliance-timeline-88332.htm); [S.S. Rana](https://ssrana.in/articles/meity-plans-to-cut-short-dpdp-compliance-timeline-and-notify-cross-border-restrictions-for-sdfs/); [Takshashila](https://takshashila.org.in/content/blogs/20260126-meity-considers-reducing-dpdpa-compliance-timelines.html)). As of March 2026 MeitY was "awaiting industry inputs" ([Pulse](https://www.pulse.bot/cybersecurity/news/meity-awaiting-industry-inputs-on-plans-to-slash-timeline-for-data-protection-compliance-s-krishnan-5c9f5771-2291-4f7c-8805-f1ee0cd409a3)).
- A LiveLaw opinion piece of 10 September 2026 treats both the Consent Manager date and the ~13 May 2027 date as fixed by rule. It reports no change to the 18-month timeline and notes that the regime can start without a functioning Board ([LiveLaw, 10 Sep 2026](https://www.livelaw.in/lawschool/articles/compliance-without-court-what-dpdpa-board-vacancy-means-may2027-549463)). One aggregator says the Government confirmed both dates in a Lok Sabha written answer on 12 August 2026. This was not verified ([search summary](https://indiadatalaw.org/deadlines/)).
- **Board status:** the Board was constituted in law on notification. As of 1 August 2026 no Chairperson or Member had been appointed. The Search-cum-Selection Committee, chaired by the Cabinet Secretary, sought applications in May–June 2026 ([LiveLaw, Board "absent in fact"](https://www.livelaw.in/articles/india-data-protection-board-established-law-543751); [LiveLaw, 10 Sep 2026](https://www.livelaw.in/lawschool/articles/compliance-without-court-what-dpdpa-board-vacancy-means-may2027-549463); [DPDP Wiki, MeitY circular 6 May 2026](https://dpdp.myndsolution.com/wiki/notifications/meity-circular-2026-05-06-dpbi-appointments/)).

### Inferences
- In November 2026 SBC has **no enforceable DPDP duty** apart from definitions and Board procedure. Its live data-protection law is IT Act s.43A with the SPDI Rules, s.72A, the Aadhaar Act, CERT-In and professional confidentiality (sections 8–9 below). Build to DPDP now anyway. The go-live date is about six months away, and the features being designed (Assist, Ask VCFO) will be running when it starts.
- Reconciliation: the report's line that "Rule 6 safeguards … start about 13 May 2027" is correct. The same date also governs s.8(2) processor contracts, s.16 transfers and the penalty Schedule (enforced through s.33). Rule 6 is not the only duty that starts then.

### Gaps
- I found no gazette notification after September 2026 that amends the commencement dates, but a final check of egazette.gov.in and meity.gov.in is needed. The exact gazette number (reported as G.S.R. 846(E) or 843(E)) was not confirmed.
- I found no confirmed Board appointment between September and November 2026.

## 2. Roles: fiduciary, processor, and s.8(2) contracts

### Takeaway
SBC decides why and how it processes directors' data: which fields it keeps, its own tools, its own retention and its own AI features. That makes it a **Data Fiduciary** in its own right, even though the data comes from the client company. The client company is also a fiduciary for its own collection and its decision to engage SBC. They are probably independent fiduciaries, possibly joint for the filing purpose. AWS (hosting, Bedrock) and Anthropic (direct API) act on SBC's instructions, so they are **Data Processors**. Under s.8(2) a processor may be used only under a valid contract. Rule 6(1)(f) adds that the contract must carry reasonable security safeguards. Both duties start ~13 May 2027.

### Cited Findings
- A fiduciary may engage a processor only under a valid contract (s.8(2)) ([Tsaaro](https://tsaaro.com/blogs/processor-contracts-under-dpdp-drafting-a-data-processing-agreement-that-survives-regulatory-scrutiny), cited in the report). Rule 6(1)(f) requires "appropriate provision in the contract" between fiduciary and processor for reasonable security safeguards ([DPDPA.com, Rule 6](https://dpdpa.com/dpdparules/rule6.html)).
- Rule 6 makes the fiduciary responsible for safeguards over data "including data processed by a Data Processor on its behalf" ([DPDPA.com, Rule 6](https://dpdpa.com/dpdparules/rule6.html)). Rule 8(3)'s one-year retention of data and logs also covers processing by a processor on the fiduciary's behalf ([DPDPA.com, Rule 8](https://dpdpa.com/dpdparules/rule8.html)).
- Commentary reads s.8(2) and Rule 6 as requiring contracts that push equivalent safeguards down to the processor ([search summary incl. DSCI brief](https://www.dsci.in/files/content/knowledge-centre/2025/Insight-Brief-on-DPDP-Rules.pdf)).

### Inferences
- The fiduciary test turns on who "determines the purpose and means" (s.2(i), background knowledge, not verified this session). SBC chooses its own systems, its retention, the Assist extension and the AI features. It is not a mere conduit for the client, so treat SBC as a fiduciary. Calling SBC only the client's processor would not fit: SBC also uses the data for its own professional record-keeping and its CA/CS regulatory duties.
- The client company is a separate fiduciary for the directors' data it collects. The engagement letter should give an allocation clause: who serves notice on directors, who handles rights requests, and how each side tells the other about a breach.
- Every vendor that touches identifiable director data needs a DPA with Rule 6 clauses by May 2027. That covers AWS (App Runner, RDS, S3, SES, Bedrock), Anthropic (direct API, if Ask VCFO uses it), Resend if used, AWS End User Messaging for WhatsApp, and Inngest if job payloads carry personal data. The DPA should also carry the CERT-In 6-hour reporting and log duties (section 7). The report already says this. It should add Rule 8(3) one-year retention and breach-notice cooperation.
- The labels-only resolver (G9) sends no personal data, so no DPDP processor relationship arises for it. That holds only while G9 holds. Ask VCFO is different: it is a processor relationship and needs the contract.

### Gaps
- No Indian authority or Board guidance on joint versus independent fiduciaries for professional advisers (CA/CS firms) was found.
- Whether Anthropic's and AWS's standard DPAs satisfy s.8(2) and Rule 6(1)(f) was not reviewed. Those terms lie outside the India-law scope.

## 3. Lawful basis: consent (s.6), legitimate uses (s.7), notice (s.5, Rule 3)

### Takeaway
The DPDP Act has **no "contractual necessity" or "legitimate interests" ground**. Processing is lawful only with s.6 consent after a s.5/Rule 3 notice, or under a listed s.7 legitimate use. Section 7(a), data "voluntarily provided", is hard to stretch to directors' data that reaches SBC through the client company. The surest course for incorporation and compliance work is a short consent and notice from each director. The client can collect it, but in SBC's name or naming SBC. Those clauses commence ~13 May 2027.

### Cited Findings
- Section 7(a) allows processing without a s.6 notice or consent where the data principal "has voluntarily provided" the data for a specified purpose and has not objected. The term is undefined in the Act and the Rules ([LiveLaw, "Who spoke first?"](https://www.livelaw.in/articles/interpreting-voluntarily-provided-section7a-dpdp-act-524783); [Bar & Bench, Poovayya](https://www.barandbench.com/view-point/voluntary-provision-of-data-under-the-dpdp-act)).
- One reading treats data as "voluntarily provided" only where the data principal initiates the transfer, unprompted. Commentators suggest that where the fiduciary initiates collection, consent is the safer basis ([LiveLaw](https://www.livelaw.in/articles/interpreting-voluntarily-provided-section7a-dpdp-act-524783)). Use is limited to the specified purpose ([search summary, ELP](https://elplaw.in/wp-content/uploads/2026/03/‘Voluntarily-provided-personal-data-How-far-can-you-go.pdf)).
- No commentary found identifies contractual necessity as a s.7 ground, and a fiduciary "cannot simply characterise any operational or commercial objective as a legitimate use" ([Tsaaro](https://tsaaro.com/blogs/what-are-‘certain-legitimate-uses’-under-the-dpdp-act-2023-and-the-draft-dpdp-rules-2025); [DPDPA.com s.7](https://dpdpa.com/dpdpa2023/chapter-2/section7.html)).
- Notice (s.5, Rule 3) and consent (s.6(1)–(8), (10)) start in the 18-month tranche ([AZB](https://www.azbpartners.com/bank/indias-digital-personal-data-protection-act-phased-rollout-and-key-compliance-milestones/)).

### Inferences
- **Director data via the client:** a director who personally gives PAN, DIN and ID proofs to SBC, for example by uploading in the client portal, is close to the s.7(a) pattern for the stated filing purpose. Data passed on by the client company is not "provided by the data principal". The client's act cannot be the director's voluntary provision. That is the researcher's reading, and the search results support it as an analysis, not as authority.
- Other s.7 grounds, background knowledge, not verified this session: s.7(d) covers performing a legal obligation to disclose to the State. Some read it to fit a statutory filing with MCA, but the ground is for the fiduciary's own legal duty. Incorporation is a duty of the promoters, not of SBC, so it is a weak fit. Section 7(c) covers state functions and does not apply. Section 7(i) covers employment and does not apply.
- **Recommendation:** add a director notice and consent step to the client questionnaire before 13 May 2027. Rule 3 needs an itemised description of data and purposes, how to withdraw, how to exercise rights and how to complain to the Board. It should name the purposes: SPICe+ preparation, DIR/KYC filings, record-keeping under professional rules, and AI-assisted drafting if Ask VCFO is used with real data. A separate consent purpose for Ask VCFO keeps the core filing work independent of the AI choice.
- **Possible exemption:** the s.3(c)(ii) carve-out for data made public by the principal or under a legal duty covers only what MCA publishes (names, DIN, some addresses). It does not cover PAN, Aadhaar or ID proofs, so it cannot carry the whole data set. The report's CS question 10 should stay open.

### Gaps
- The verbatim s.7 sub-clauses and Rule 3 notice items were not fetched.
- No guidance was found on a professional adviser relying on s.7(a) or s.7(d) for client-supplied third-party data.

## 4. Cross-border transfer (s.16 and Rule 15): Anthropic US versus Bedrock

### Takeaway
Section 16 is a **negative-list model**: transfer is allowed except to countries the Centre restricts by notification. As of November 2026 no negative list has been notified, and s.16 itself commences only ~13 May 2027. Sending Ask VCFO data to Anthropic in the US is therefore not prohibited by DPDP today, but it is a cross-border disclosure. Under the SPDI Rules in force now, it needs consent or contractual necessity plus equivalent protection (section 8). For residency, Bedrock's **India geographic cross-region inference profile** (`in.` prefix) keeps inference inside Mumbai and Hyderabad. The **Global** profile can route to any commercial Region.

### Cited Findings
- Rule 15 makes transfer outside India permissive by default, subject to any requirements the Centre sets by general or special order about foreign states or their agencies. No list of restricted countries has been notified: "Until specific orders are published, it is not yet possible to enumerate those requirements" ([DPDPA.com, Rule 15](https://dpdpa.com/dpdparules/rule15.html)).
- Section 16 sits in the 18-month tranche ([AZB](https://www.azbpartners.com/bank/indias-digital-personal-data-protection-act-phased-rollout-and-key-compliance-milestones/)). In early 2026 MeitY floated cross-border restrictions for Significant Data Fiduciaries ([S.S. Rana](https://ssrana.in/articles/meity-plans-to-cut-short-dpdp-compliance-timeline-and-notify-cross-border-restrictions-for-sdfs/)).
- Sector rules can impose stricter localisation, for example RBI payment-data storage ([DPDPA.com, Rule 15](https://dpdpa.com/dpdparules/rule15.html)). Section 16(2) preserves higher-protection sectoral laws (background knowledge, not verified this session).
- On 29 September 2026 AWS announced India geographic cross-region inference for Claude Opus 5, Claude Sonnet 5 and Claude Haiku 4.5. It routes only between ap-south-1 (Mumbai) and ap-south-2 (Hyderabad), and its model IDs carry the `in.` prefix, for example `in.anthropic.claude-sonnet-5`. It "keeps inference within India". Customer data, CloudWatch and CloudTrail logs stay in the source Region. Bedrock does not store inputs or outputs by default, but some models may need AWS human review when safety classifiers flag content ([AWS ML blog, 29 Sep 2026](https://aws.amazon.com/blogs/machine-learning/amazon-bedrock-expands-claude-model-availability-to-india-cross-region-inference/)).
- A separate AWS post offers India customers Claude models through **Global** cross-region inference, which can route requests from ap-south-1 to commercial Regions worldwide ([AWS ML blog, Global CRIS for India](https://aws.amazon.com/blogs/machine-learning/access-anthropic-claude-models-in-india-on-amazon-bedrock-with-global-cross-region-inference); [Bedrock docs, inference profiles](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html)).

### Inferences
- **Labels-only resolver (G9):** no personal data, so no transfer issue on either route.
- **Ask VCFO with real client data:** prefer Bedrock with an `in.` profile. Pin the model ID in config and add a test that rejects `global.` or `apac.` IDs. This removes the cross-border question entirely and keeps the processor (AWS) the same as the hosting processor. If the direct Anthropic API is used, record it as a US transfer in the notice and DPA, and get SPDI Rule 7 cover now (consent or necessity). Keep `src/lib/ask/mask.ts` masking PAN and Aadhaar before the call either way.
- Reconciliation: the report's line "Cross-border processing under DPDP s.16 is unclear" can be narrowed. There is no restriction as of November 2026, and none is notified for May 2027 yet. The risk is a future negative list or SDF-specific restriction, plus SPDI Rule 7 today.
- No localisation rule was found for CA/CS client data or MCA filing data. Aadhaar data is different. Under the 2025 ADV circular, a requesting entity's vault must sit on premises, on a MeitY-empanelled Government Community Cloud, or with an ADV-as-a-service provider (section 6). That applies only to requesting entities.

### Gaps
- Anthropic's direct-API data location, retention and zero-retention terms were not researched.
- The availability of the `in.` profile per model on 10 November 2026 should be confirmed in the Bedrock console.

## 5. Security (Rule 6), breach notice (Rule 7), retention (Rule 8), SDF status and penalties

### Takeaway
From ~13 May 2027 SBC must meet the Rule 6 minimum controls and keep data and logs for **one year**. It must notify the Board immediately and with a detailed report within **72 hours**, and tell each affected director "without delay". The penalty Schedule runs **up to ₹250 crore** for failed safeguards and **₹200 crore** for failed breach notice. SBC is very unlikely to be a Significant Data Fiduciary, because that needs a Government notification naming it.

### Cited Findings
- **Rule 6 minimums:**
  - (a) encryption, obfuscation, masking or virtual tokens;
  - (b) access control on the fiduciary's and processor's computer resources;
  - (c) logs, monitoring and review to detect and fix unauthorised access;
  - (d) continuity measures such as backups;
  - (e) retention of logs and personal data for one year unless another law says otherwise;
  - (f) security clauses in processor contracts;
  - (g) technical and organisational measures to make the safeguards work.

  Source: [DPDPA.com, Rule 6](https://dpdpa.com/dpdparules/rule6.html).
- **Rule 7 breach notice:** each affected data principal must be told "without delay" through their account or registered contact. The notice covers nature, extent and timing, likely consequences, mitigation, protective steps they can take, and a contact. The Board gets an immediate description, then a detailed report within 72 hours of the fiduciary becoming aware. That report covers facts, cause, mitigation, who caused the breach, prevention and the notices sent. The Board may extend the 72 hours on a written request ([DPDPA.com, Rule 7](https://dpdpa.com/dpdparules/rule7.html)). Commentators differ on whether notice to individuals is also capped at 72 hours ([search summary incl. KSK](https://ksandk.com/data-protection-and-data-privacy/dpdp-breach-notification-rules-and-modern-incident-response/)).
- **Rule 8 retention:**
  - Rule 8(1)–(2): erasure after a Third Schedule period, with 48 hours' prior notice. This applies only to the classes of fiduciary listed in the Third Schedule.
  - Rule 8(3): every fiduciary must keep personal data, associated traffic data and processing logs for at least one year from processing, including processing by its processors, for the Seventh Schedule purposes. After that it must erase them unless another law requires more.

  Source: [DPDPA.com, Rule 8](https://dpdpa.com/dpdparules/rule8.html).
- **Penalty Schedule:**

  | Breach | Maximum penalty |
  |---|---|
  | Security safeguards, s.8(5) | ₹250 crore |
  | Breach notice, s.8(6) | ₹200 crore |
  | Children, s.9 | ₹200 crore |
  | SDF duties, s.10 | ₹150 crore |
  | Data principal duties, s.15 | ₹10,000 |
  | Breach of a voluntary undertaking | The penalty for the original breach |
  | Any other breach | ₹50 crore |

  Source: [DPDPA.com, Schedule](https://dpdpa.com/theschedule.html). Penalties apply through s.33, which commences ~13 May 2027 ([LiveLaw](https://www.livelaw.in/lawschool/articles/compliance-without-court-what-dpdpa-board-vacancy-means-may2027-549463)).

### Inferences
- **SDF:** s.10 status comes only from a Government notification, assessed on volume and sensitivity of data, risk to rights, sovereignty, electoral democracy, security and public order (background knowledge, not verified this session). A single CA/CS firm will not plausibly be notified. Even the proposed 12-month SDF timeline would not reach SBC.
- **Map to VCFO Suite:**
  - Rule 6(a): encrypt PAN and Aadhaar fields at rest, column-level beyond RDS encryption, and mask them in UI and logs.
  - Rule 6(b): role scoping already sits in repositories (CLAUDE.md rule 2).
  - Rule 6(c) and (e): an application audit log for reads of identity documents. Keep it at least one year (DPDP) and 180 days (CERT-In).
  - Rule 6(d): RDS backups with tested restore.
  - Rule 8(3) conflicts with the extension's "store nothing" posture only if the extension processes personal data on SBC's behalf. Logs of what was filled (labels, not values) in `assist_runs` satisfy the logging duty without keeping values twice.
- **Breach runbook:** one incident triggers three clocks. CERT-In gets 6 hours, now. The Board gets "immediately" plus 72 hours, from May 2027. Each affected director is notified without delay, from May 2027. The client company and the firm's ICAI/ICSI duties are notified as the contract requires.
- Reconciliation: the report cites only ₹250 crore. The ₹200 crore breach-notice cap and the ₹50 crore residual cap are just as relevant to SBC. The latter covers notice and consent failures and processor-contract failures.

### Gaps
- The Seventh Schedule purposes, which define what the one-year logs serve, and the Third Schedule classes were not read in full text.
- The penalty calibration factors in s.33(2) were not fetched.

## 6. Aadhaar Act 2016, regulations and UIDAI circulars

### Takeaway
SBC is not an AUA or KUA and does not authenticate with UIDAI. Since UIDAI's revised Aadhaar Data Vault circular of 18 July 2025 (Circular 8 of 2025) and its FAQs of 3 November 2025, **ADV rules apply only to requesting entities**, not to bodies that just collect Aadhaar copies. That removes the old 2017 FAQ view that any entity storing even masked Aadhaar numbers digitally needed a vault. SBC still faces Aadhaar Act s.29: use only for the purpose collected, no disclosure beyond it, no public display. The safest design is to **store masked Aadhaar only** (last four digits). Keep any Aadhaar image or PDF that a filing needs in encrypted object storage with strict access. Never send full Aadhaar numbers to any vendor or AI. A UIDAI rule requiring offline-verification seekers to register and moving them off photocopies was approved in December 2025. As of August 2026 it was reported as still to be notified.

### Cited Findings
- The 2017 ADV circular required Aadhaar numbers and connected data to sit in a separate encrypted vault, with keys in an HSM, reference-key tokenisation and strict access logging. The 2017 FAQs applied this to "AUAs / KUAs / Sub-AUAs and other entities", including those storing masked Aadhaar of employees ([Khaitan & Co ERGO, 10 Dec 2025](https://www.khaitanco.com/sites/default/files/2025-12/ERGO%20-%20Aadhaar%20Data%20Vault%20-%2010%20December%202025.pdf); [UIDAI ADV FAQs 2017](https://uidai.gov.in/images/resource/FAQs_Aadhaar_Data_Vault_v1_0_13122017.pdf)).
- The 2025 Circular (18 July 2025) and FAQs (3 November 2025) "clarify that ADV requirements only apply to REs and not to other entities like OVSEs or entities collecting Aadhaar information of employees for internal purposes (without referring the same to UIDAI for verification)". Vault hosting is restricted to RE premises, a MeitY-empanelled Government Community Cloud, or ADV-as-a-service. Encryption must be AES-256 or above. Demographic data may be stored outside the vault if the Aadhaar number and UID token are not stored with it, under encryption, obfuscation or masking ([Khaitan & Co ERGO](https://www.khaitanco.com/sites/default/files/2025-12/ERGO%20-%20Aadhaar%20Data%20Vault%20-%2010%20December%202025.pdf); [Mondaq, "Vaulting to safety"](https://www.mondaq.com/india/privacy-protection/1719124/vaulting-to-safety-uidai-issues-clarifications-on-applicability-of-aadhaar-data-vault-requirements)).
- UIDAI has filed police complaints for breach of s.29(4), which prohibits public display of Aadhaar information ([S.S. Rana](https://ssrana.in/articles/aadhaar-authentication-by-private-entities-from-data-privacy-perspective/)).
- An offline verification seeking entity may not store the Aadhaar number ([search summary of the 2021 Authentication and Offline Verification Regulations](https://www.uidai.gov.in/images/The_Aadhaar_Authentication_and_Offline_Verifications_Regulations_2021.pdf)). Reporting says the Act prohibits collecting, using or storing the Aadhaar number or biometrics in offline verification, though entities still keep photocopies ([Business Standard, Dec 2025](https://www.business-standard.com/india-news/uidai-to-mandate-registration-for-entities-using-aadhaar-verification-125120700522_1.html)).
- In December 2025 UIDAI's CEO said a rule requiring entities that use Aadhaar verification (hotels, event organisers and so on) to register and use QR, app or API verification "has been approved by the authority and will be notified soon" ([Business Standard](https://www.business-standard.com/india-news/uidai-to-mandate-registration-for-entities-using-aadhaar-verification-125120700522_1.html); [Biometric Update](https://www.biometricupdate.com/202512/india-to-ban-aadhaar-photocopying-as-uidai-moves-to-regulate-private-sector-verification)). In August 2026 it was still described as proposed ([Business Today, 30 Aug 2026](https://www.businesstoday.in/india/story/do-you-still-need-aadhaar-for-hotel-check-ins-heres-what-is-changing-552102-2026-08-30)).
- The 2018 Puttaswamy (Aadhaar) judgment limited private collection of Aadhaar to voluntary, informed-consent use ([Khaitan & Co ERGO](https://www.khaitanco.com/sites/default/files/2025-12/ERGO%20-%20Aadhaar%20Data%20Vault%20-%2010%20December%202025.pdf)).

### Inferences
- **Is storing full Aadhaar numbers legal for SBC?** Nothing found prohibits a non-RE outright from holding an Aadhaar copy that a director supplies for a filing. Since the 2025 circular, the ADV mandate does not bind SBC. But s.29(3), background knowledge, not verified this session, bars using identity information beyond the purpose stated at submission and disclosing it without consent. Section 29(4) bars publishing or displaying the number. Under rule 1 of the firm's report ("unclear means prohibited"), keep the stance the report and G9 already take: store only masked Aadhaar (XXXX-XXXX-1234) as a structured field. Show it masked everywhere. Never put it in logs, prompts or emails. Keep any uploaded Aadhaar image or PDF the filing needs encrypted in S3 with read-audit. Purge it when the purpose ends, subject to the record-keeping periods in section 9.
- **Masking:** UIDAI's own masked e-Aadhaar shows only the last four digits (background knowledge, not verified this session). Use that pattern.
- **eKYC:** the report's "Prohibited" rating for SBC running Aadhaar eKYC is consistent. eKYC and authentication are only for requesting entities that UIDAI has appointed.
- If the pending OVSE registration rule is notified, it might reach a firm that "verifies" directors from Aadhaar copies. Watch for it. The answer would be to rely on the DSC/DIN KYC chain and MCA's own checks, not to verify Aadhaar in-house.

### Gaps
- The verbatim text of s.29 and the Aadhaar (Sharing of Information) Regulations 2016 reg. 6 could not be fetched. The UIDAI server returned 503.
- Aadhaar Act penalties were not verified from a source: s.29 offences and the 2019 civil penalty of up to ₹1 crore under s.33A (background knowledge).
- The official notification status of the OVSE registration rule on 10 November 2026 is unknown.
- I did not research whether MCA's SPICe+ or DIR-3 KYC forms actually require the full Aadhaar number.

## 7. CERT-In Directions of 28 April 2022

### Takeaway
The Directions apply to "body corporate", and the IT Act defines that to include a **firm or sole proprietorship engaged in professional activities**, so SBC is covered regardless of size. They have been in force since about **27 June 2022**. SBC must report listed incidents to CERT-In **within 6 hours** of noticing them. It must keep ICT logs for a rolling **180 days**, sync clocks to NTP, and name a point of contact. The KYC duties for VPN, VPS and cloud providers bind the providers (for example AWS), not SBC. Corporate VPNs are excluded.

### Cited Findings
- **Who is covered:** "Service providers, intermediaries, data centres, body corporate, VPS providers, Cloud service providers, VPN Service providers … and Government organisations". Individual citizens are not covered ([CERT-In FAQs, May 2022, Q7](https://www.cert-in.org.in/PDF/FAQs_on_CyberSecurityDirections_May2022.pdf)). "Body corporate" takes the s.43A meaning: "any company and includes a firm, sole proprietorship or other association of individuals engaged in commercial or professional activities" (FAQ Q25, same source).
- Incidents must be reported "within 6 hours of noticing the incident or being brought to notice about such incident" (FAQ Q24). The reporting duty is statutory and overrides contractual confidentiality under IT Act s.81 (FAQ Q22). Incidents affecting the entity's data held on a third party's systems must still be reported (FAQ Q31) ([CERT-In FAQs](https://www.cert-in.org.in/PDF/FAQs_on_CyberSecurityDirections_May2022.pdf)).
- **Logs:** ICT system logs must be kept securely for a rolling 180 days ([ManageEngine summary](https://www.manageengine.com/log-management/cyber-security/cert-in-compliance-for-indian-enterprises.html); [PSA Legal](https://psalegal.com/new-cert-in-directions-overview-and-implications/)). The Directions say "within the Indian jurisdiction". The FAQ, however, says "The logs may be stored outside India also as long as the obligation to produce logs to CERT-In is adhered to … in a reasonable time" (FAQ Q35). The example logs are firewall, IPS, SIEM, web, database, mail, proxy, application, SSH and VPN (FAQ Q37) ([CERT-In FAQs](https://www.cert-in.org.in/PDF/FAQs_on_CyberSecurityDirections_May2022.pdf)).
- **Clocks:** clocks must sync to NPL or NIC NTP, or to an equivalent accurate standard source for multi-geography infrastructure (FAQ Q41) ([CERT-In FAQs](https://www.cert-in.org.in/PDF/FAQs_on_CyberSecurityDirections_May2022.pdf)).
- **Providers:** data centres, VPS, cloud and VPN providers must keep subscriber KYC (FAQ Q33). For this purpose a "VPN Service provider" means a public "Internet proxy like" service, not an enterprise VPN (FAQ Q34) ([CERT-In FAQs](https://www.cert-in.org.in/PDF/FAQs_on_CyberSecurityDirections_May2022.pdf)).
- **Effect and penalty:** the Directions took effect 60 days after issue (FAQ Q44). Non-compliance "may attract" s.70B(7), and that power is to be used "reasonably and on occasions when the non-compliance is deliberate" (FAQ Q23) ([CERT-In FAQs](https://www.cert-in.org.in/PDF/FAQs_on_CyberSecurityDirections_May2022.pdf)). One source gives the effective date as 27 June 2022 ([search summary](https://mondaq.co.uk/india/it-and-internet/1270332/6-hours-to-report-cyber-incidents-to-cert-in)).

### Inferences
- SBC is in scope as a body corporate. Its App Runner, RDS and S3 stack in ap-south-1 already keeps logs in India. Set CloudWatch, CloudTrail, App Runner and application audit-log retention to at least 180 days, which in practice means one year to also meet DPDP Rule 6(e) and 8(3). Store times in UTC with the zone recorded.
- Name a CERT-In point of contact and add the 6-hour report to the incident runbook. Unauthorised access to systems or data and data leaks are reportable types (background knowledge of Annex I, not verified this session).
- The extension runs on staff browsers. A compromised staff machine or extension that leaks client data is a reportable SBC incident.
- Reconciliation: the report's "Keep ICT logs for 180 days" is right. Add that the FAQ allows offshore storage if logs are produced promptly. This matters if Anthropic or another vendor's logs sit abroad.

### Gaps
- I could not verify the reported MSME extension. Memory says it ran to 25 September 2022 for MSMEs, but no source was found.
- The s.70B(7) penalty was not fetched. Background knowledge says imprisonment up to one year or a fine up to ₹1 lakh, or both.

## 8. SPDI Rules 2011, IT Act s.43A and s.72A

### Takeaway
Yes, they are in force now. Section 44(2) of the DPDP Act omits s.43A, and through it the SPDI Rules, but s.44(2) sits in the 18-month tranche. Until ~13 May 2027, s.43A (compensation for negligent failure to keep reasonable security practices over sensitive personal data) and the SPDI Rules govern SBC. Section 72A (criminal disclosure in breach of a lawful contract) is not omitted and continues after May 2027.

### Cited Findings
- Section 44(2) omits s.43A and the rule-making power in s.87(2)(ob). It commences with the 18-month tranche, so s.43A and the SPDI Rules remain until about 13 May 2027 ([KSK, "What happens to SPDI Rules"](https://ksandk.com/data-protection-and-data-privacy/what-happens-spdi-rules-after-dpdp-enforcement/); [DPDP Wiki, s.44](https://dpdp.myndsolution.com/wiki/act/section-44-amendments-to-certain-acts/); [AZB](https://www.azbpartners.com/bank/indias-digital-personal-data-protection-act-phased-rollout-and-key-compliance-milestones/)). One firm notes that the SPDI Rules "continue to remain in force for 18 more months" ([search summary of Mondaq/Conventus](https://conventuslaw.com/featured-content/building-indias-digital-privacy-framework-an-overview-of-the-dpdp-rules-2025/)).
- The new regime "penalises, but it does not compensate". After omission, individuals lose the s.43A compensation route ([ELP paper, June 2026](https://elplaw.in/wp-content/uploads/2026/06/The-DPDPAs-Enforcement-Gap-Limited-Remedies-for-Data-Principles-and-Independence-of-the-DPB.pdf)). Commentary warns against treating the gap as a compliance holiday ([Sansa Legal](https://www.sansalegal.com/post/how-to-prepare-for-the-omission-of-section-43a-of-the-information-technology-act)).

### Inferences (background knowledge, not verified this session; check the bare text)
- **SPDI Rule 3:** sensitive personal data covers passwords, financial information (bank, card), health, sexual orientation, medical records and biometrics. PAN, DIN, name, address and an Aadhaar number alone are probably not SPDI. Bank details in incorporation (capital or subscription) and any biometric data would be. So s.43A bites only on part of the data set, but SPDI Rules 4–8 practice (privacy policy, consent, security) is good hygiene for all of it.
- **SPDI Rule 5:** consent in writing for collecting SPDI, purpose limitation, and keeping data no longer than needed.
- **SPDI Rule 6:** prior consent before disclosing SPDI to a third party, except where a contract with the provider allows it or law requires it.
- **SPDI Rule 7:** transfer of SPDI to any entity, in India or abroad, only if it ensures the same level of protection and the transfer is necessary for a lawful contract or consented to. This is the live rule for Ask VCFO sending any bank or financial data to Anthropic US.
- **SPDI Rule 8:** IS/IEC 27001 or an approved code, with audits. A documented ISMS and an AWS-aligned control set is the standard defence.
- **s.43A:** compensation, uncapped since the 2008 amendment, for negligence in reasonable security practices causing wrongful loss or gain.
- **s.72A:** disclosure of personal information obtained under a lawful contract, without consent or in breach of contract, with intent to cause or knowing it is likely to cause wrongful loss or gain. Punishment is up to 3 years' imprisonment, a fine up to ₹5 lakh, or both. This bites on an employee or vendor misusing director data, and survives DPDP. The report's open question 11 (current text of s.72A) is still open.

### Gaps
- The SPDI Rules and s.43A and s.72A texts were not fetched this session.

## 9. Professional confidentiality: ICAI and ICSI

### Takeaway
Clause (1) of Part I of the Second Schedule to the Chartered Accountants Act 1949 makes it professional misconduct for a CA in practice to disclose information acquired in a professional engagement to anyone other than the client without the client's consent, or otherwise than as required by law. Sending client data to an AI vendor or other third party is therefore a professional-conduct question on top of DPDP. The client's written consent to named sub-processors is the cure. The ICSI regime under the Company Secretaries Act 1980 has a parallel clause (background knowledge, not verified this session).

### Cited Findings
- Clause (1), Part I, Second Schedule, CA Act 1949: disclosing information "acquired in the course of his professional engagement to any person other than his client so engaging him, without the consent of his client or otherwise than as required by any law" is misconduct ([TaxClue, clause 1](https://www.taxclue.in/blog/clause-1-second-schedule-client-confidentiality/); [AdvocateKhoj, Second Schedule Part I](https://www.advocatekhoj.com/library/bareacts/charteredaccountants/schedule2part1.php); [WIRC-ICAI ethics material](https://old.wirc-icai.org/images/material/Know-your-Ethics.pdf)). Disclosure under a legal or professional duty is not misconduct ([BCAJ, Ethics & U](https://bcajonline.org/journal/ethics-and-u-31/)).
- The report already records ICAI discipline: a ₹2 lakh fine for a due-diligence lapse on an MCA filing, and a ₹50,000 fine for holding client records ([report anchor table](../../reports/MCA%20SPICe%20filing%20automation%20options.md)).

### Inferences
- Is a processor a "person other than his client"? Hosting with AWS is generally read as use of a tool, not disclosure. An AI chat that sends a client's facts to a third-party model provider is closer to the line. Under the firm's rule 1, take written client consent in the engagement letter, naming AWS (India) and Anthropic or Bedrock as sub-processors, before Ask VCFO handles real client data.
- Confidentiality also limits retention and erasure. ICAI's working-paper retention guidance and Companies Act record periods may be "law requiring retention" under DPDP Rule 8 (background knowledge, not verified this session).

### Gaps
- The ICSI Company Secretaries Act Schedule wording and the ICAI Code of Ethics 2019/2020 confidentiality section (s.114/140) were not fetched.
- No ICAI or ICSI guidance on cloud or AI use with client data was found in this session.

## 10. Summary obligations table for SBC (10 Nov 2026)

| Obligation | Law | In force? | SBC action |
|---|---|---|---|
| Reasonable security over SPDI; compensation for negligence | IT Act s.43A + SPDI Rules 2011 | Yes, until ~13 May 2027 | ISMS, encryption, access control, privacy policy |
| Criminal disclosure in breach of contract | IT Act s.72A | Yes (survives DPDP) | Staff and vendor confidentiality terms |
| 6-hour incident report; 180-day logs; NTP; point of contact | CERT-In Directions 28 Apr 2022 | Yes, since ~27 Jun 2022 | Runbook; log retention of at least 180 days (aim for 1 year) |
| s.29 purpose limit, no display; masking | Aadhaar Act 2016 | Yes | Store masked Aadhaar only; never send it to AI |
| ADV vault | UIDAI Circular 8/2025 | Yes, but only for REs | Not applicable unless SBC becomes an AUA, KUA or sub-AUA |
| Client confidentiality | CA Act Sch. II Pt I cl.(1); CS Act | Yes | Client consent to sub-processors in engagement letter |
| Consent Manager registration | DPDP Rule 4 | ~13 Nov 2026 | No duty for SBC |
| Notice and consent; legitimate uses; s.8(2) processor contracts; Rule 6, 7 and 8; s.16; rights; penalties up to ₹250 cr | DPDP Act + Rules | ~13 May 2027 (12 May per AZB) | Director notice and consent in questionnaire; DPAs with AWS and Anthropic; breach runbook (Board in 72 h); one-year logs |
