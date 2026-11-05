# Official MCA / SPICe+ data channels and third-party data APIs (as of November 2026)

Research note, desk research only (searched 2026-11-05). No API was called and no portal was logged into.
**Network limitation:** this session could not fetch mca.gov.in, negd.gov.in, directory.apisetu.gov.in, resources.probe42.in or meon.co.in, because their hosts are outside the session's allowed network. So most findings below come from search-result summaries of secondary sources (taxguru, Medianama, vendor pages, law-firm notes) rather than from the primary MCA, NeGD or API Setu pages. Treat every finding as "reported, not confirmed on the primary page" until someone with access checks it. Where a statement rests on the researcher's background knowledge and has no source, it sits under **Inferences** or **Gaps**, not **Cited Findings**.

## 1. Does MCA publish a filing API, offline utility, bulk upload, schema or partner (ASP) programme for SPICe+ on V3?

### Takeaway
No public evidence was found of any MCA filing API, offline eForm utility, bulk-upload channel, published XML/JSON schema or ASP/GSP-style partner programme for SPICe+ or any other V3 form. Filing on V3 is web-form only, done by a logged-in "Business User" with a linked DSC. The only official machine-readable MCA data is the read-only Company Master Data dataset on data.gov.in (OGD).

### Cited Findings
- V2 e-filing was shut down on 18 June 2025, and the final batch of 38 company forms (including 13 annual-filing and 6 audit/cost-audit forms) went live on V3 on 14 July 2025. — [InstaFinancials blog](https://blog.instafinancials.com/2025/06/19/mca-launches-final-38-company-forms-from-july-14-2025/); [Taxscan](https://www.taxscan.in/mca-to-launch-final-set-of-company-forms-on-v-portal-on-june-key-deadlines-and-filing-instructions/524419)
- To file on V3, professionals and company representatives must create or upgrade their user ID to the "Business User" category and link their DSC. — [InstaFinancials blog](https://blog.instafinancials.com/2025/06/19/mca-launches-final-38-company-forms-from-july-14-2025/)
- A search for official V3 API documentation for professionals' filing integration found none; the results were about the portal rollout and its glitches. — search summary of [taxguru](https://taxguru.in/?p=966411), [StudyCafe](https://studycafe.in/mca21-v3-rollout-new-ai-driven-filing-for-2025-annual-filing-of-companies-380216.html)
- In October 2025 CAs and CSs complained of V3 technical problems that delayed annual filings. MCA asked LTIMindtree, the vendor, to review server capacity, and the annual-filing deadline was extended to 31 December 2025. — [Taxscan](https://www.taxscan.in/top-stories/mca-works-to-fix-technical-glitches-on-version-3-portal-lti-mindtree-asked-to-review-server-capacity-and-user-issues-1435835); [StudyCafe](https://studycafe.in/mca-version-3-portal-faces-glitches-despite-annual-returns-filing-deadline-extension-to-december-2025-396980.html); [Business Standard via Magzter](https://www.magzter.com/en/stories/newspaper/Business-Standard/PROFESSIONALS-CALL-FOR-FIXING-MCA-30-PORTAL-878645)
- Vendor blogs say V3 integrates with the Income Tax Department (PAN name match), UIDAI (Aadhaar OTP) and GSTN (GST pre-fill). These are government-to-government links, not interfaces open to outside software. The claims could not be checked against MCA material. — [IncorpX blog](https://www.incorpx.io/blog/mca-v3-portal-filing-changes-2026), as summarised in search results
- **Official open data:** data.gov.in publishes MCA's "Registrars of Companies (RoC)-wise Company Master Data" (catalogue `https://data.gov.in/catalog/company-master-data`). A third-party listing gives resource ID `4dbe5667-7b6b-41d7-82af-211562424d9a`. — [community.data.gov.in (Gujarat note)](https://community.data.gov.in/registrars-of-companies-roc-wise-company-master-data-of-gujarat); [Apify OGD actor listing](https://apify.com/nexgendata/india-mca-companies-director-filings-ogd)
- Third-party wrappers report that the OGD dataset covers about 3.6 to 3.7 million companies, with fields CIN, name, status, RoC, state, capital, class and NIC code. They also say directors and charges are not published on OGD. The data.gov.in API needs a free key; the shared sample key is rate-limited (about 10 requests per minute, according to one actor). — [Apify nexgendata OGD actor](https://apify.com/nexgendata/india-mca-companies-director-filings-ogd); [Apify OGD lookup](https://apify.com/nexgendata/ogd-india-companies-registry)
- No official MCA company-data API was found on API Setu. The search returned only third-party MCA APIs (Qorpiq, Decentro, Apify actors, a 2019 GitHub wrapper around compdata.in). — search summary of [Qorpiq docs](https://developers.qorpiq.com/docs/mca-company-master-data), [Decentro](https://decentro.tech/api-hub/mca-verification-api), [GitHub araystech/mca-data-api](https://github.com/araystech/mca-data-api)
- MCA's own V3 "View Company/LLP Master Data" service needs a captcha before it shows a result. One guide describes the captcha as there "to prevent automated scraping". — [cspratik gitbook](https://cspratik.gitbook.io/learningcenter/technical-guide/mca-website/mca-master-data/view-company-llp-master-data); [Surepass FAQ](https://surepass.io/faq/how-to-view-company-master-data-v3/)

### Inferences
- Software cannot lawfully *submit* SPICe+. On V3 the only sanctioned submission path is a human Business User session with DSC signing in the browser. A firm's app can, at most, *prepare* the data (a field-by-field sheet, attachments named and sized to MCA's limits, a DSC checklist) for a professional to key in. Driving the V3 web UI with browser automation would not be a sanctioned channel. The captcha and the portal terms point the other way, and it would breach the firm's "nothing illegal" rule. (Inference; the V3 terms of use were not fetched.)
- Background knowledge, unverified here: before V3, the linked SPICe+ attachments (AGILE-PRO-S, e-MoA, e-AoA, INC-9, URC-1) were offline PDF eForms that could be pre-filled and uploaded. V3 turned them into web forms, which removed the only "offline utility" professionals ever had for incorporation.
- The OGD dataset is the one clean, licensed (Government Open Data Licence – India) bulk source. It suits name-collision pre-checks against existing company names and NIC/RoC lookups, but it is periodic, not real time, and it has no director data.

### Gaps
- The API Setu directory (directory.apisetu.gov.in) could not be reached, so it is unconfirmed whether MCA lists any API there (for example a CIN verification API restricted to government or regulated entities).
- No primary MCA source was found for a "Data and Reports" bulk-purchase product, or for its current terms and pricing.
- No MCA21 Phase III tender documents (LTIMindtree) were found that mention APIs for professionals; this was not searched exhaustively.
- The OGD dataset's refresh frequency and exact field list were not confirmed on data.gov.in itself.

## 2. NSWS (nsws.gov.in) and SPICe+: can incorporation start there, and does NSWS have APIs?

### Takeaway
Yes, incorporation can be started there. Since October 2023, company and LLP incorporation forms can be filed through NSWS, which forwards them to MCA for processing. No evidence was found of a public NSWS API for private software.

### Cited Findings
- On 23 October 2023 MCA announced that company and LLP incorporation forms can also be filed through the National Single Window System, and that "the application filed on the NSWS portal shall be forwarded to MCA for further processing." — [taxguru (2023 update)](https://taxguru.in/?p=982949); [lexplosion](https://lexplosion.in/?p=121731)
- NSWS is run by DPIIT (Ministry of Commerce and Industry) and hosts approvals from 31 central departments and 22 state governments. — [taxguru](https://taxguru.in/?p=982949), as summarised
- A ministry spokesperson said the MCA system "has been seamlessly integrated with the NSWS for the incorporation of companies and LLPs." — [news.vakilsearch](https://news.vakilsearch.com/?p=939)
- The primary MCA circular for the NSWS integration did not appear in search results; only secondary blogs did. — search summary

### Inferences
- NSWS is a second *front door* to the same MCA back end; it is not an integration channel for outside software. It may help a client who also needs state or central approvals listed on NSWS, but it does not let a firm's app push SPICe+ data.

### Gaps
- No NSWS developer API, partner programme or API Setu listing was found. This is unconfirmed rather than disproven, because nsws.gov.in was not fetched.
- Whether NSWS-originated SPICe+ filings use the same V3 web forms, or a different NSWS-hosted form, is not documented in what was found.

## 3. Linked integrations in SPICe+ (PAN/TAN, EPFO, ESIC, GSTIN, bank, Shops & Establishment, professional tax): any APIs?

### Takeaway
All of these are government-to-government (or MCA-to-bank) links triggered inside SPICe+ and AGILE-PRO-S. None is exposed as an API that a firm's software could call to submit or fetch registration numbers. The resulting numbers reach the applicant through the MCA portal and by email.

### Cited Findings
- AGILE-PRO-S (INC-35) is filed with SPICe+. It covers GSTIN, EPFO, ESIC, Profession Tax, bank account opening and Shops & Establishment registration, and is mandatory under Rule 38A of the Companies (Incorporation) Rules, 2014. The director who signs SPICe+ also signs AGILE-PRO-S. — [MCA AGILE page (V2)](https://www.mca.gov.in/MinistryV2/agile.html); [Enterslice](https://enterslice.com/learning/form-agile-pro-s/)
- Rule 38A was inserted by G.S.R. 275(E) of 29 March 2019 to link MCA21 with EPFO, ESIC and GST at incorporation. — [taxguru](https://taxguru.in/?p=716581), as summarised
- Every company incorporated through SPICe+ from 23 February 2020 must apply for a bank account through the AGILE-PRO-S linked web form. There is no separate fee for GSTIN, EPFO, ESIC, PT or the bank account. — [taxguru](https://taxguru.in/?p=774344); [RegisterKaro](https://www.registerkaro.in/post/agile-pro-s-form)
- A 2020 brief says that once the data is validated, the code or number is generated, shown on the MCA portal and sent to the authorised person's email ID. — [Aparajitha FIN-01 note, 06 March 2020](https://compfie.aparajitha.com/wp-content/uploads/2020/03/06032020_FIN_01.pdf) (dated 2020, may not reflect V3)
- SPICe+ (introduced 15 February 2020) covers name reservation, incorporation, DIN allotment, mandatory PAN and TAN, EPFO, ESIC and Profession Tax (state-dependent). — [Quicko Learn](https://learn.quicko.com/spice-plus-form-overview?amp); [Corpseed](https://corpseed.com/knowledge-centre/spice-plus)
- A vendor guide says V3 pre-fills details into the linked forms (AGILE-PRO-S, e-MoA, e-AoA, URC-1, INC-9). — [IncorpX](https://www.incorpx.io/blog/spice-plus-form-company-incorporation-guide-2026), as summarised

### Inferences
- PAN and TAN for a new company are issued by CBDT through Protean (NSDL) and printed on the Certificate of Incorporation. No PAN-application API for a new company exists outside SPICe+. (Background knowledge; not sourced here.)
- After incorporation, a firm's app can lawfully *verify* the issued GSTIN, PAN and CIN through the licensed verification vendors in section 5. It cannot *apply* for any of them outside SPICe+.

### Gaps
- No official EPFO, ESIC or state Shops & Establishment API for private software was found. EPFO and ESIC have employer portals, but no third-party submission API turned up.
- Which banks currently take part in AGILE-PRO-S, and whether any bank offers a partner API for SPICe+-originated accounts, was not found.

## 4. DigiLocker, Entity Locker, DIN/DIR-3 KYC and Aadhaar eKYC: anything usable by a firm?

### Takeaway
Entity Locker (NeGD, launched January 2025) is the business twin of DigiLocker. It is reported to link with MCA, GSTN and DGFT, and lets a registered entity share documents with another registered entity by PAN. It is usable *after* incorporation for pulling and sharing company documents with consent. It is not a filing channel. DigiLocker offers formal Issuer and Requester onboarding through API Setu. DIR-3 KYC and Aadhaar eKYC have no channel open to a firm's software.

### Cited Findings
- Entity Locker (entity.digilocker.gov.in) is a NeGD platform for businesses, MSMEs, trusts and startups to store and verify documents. It is reported to integrate with MCA, GSTN and DGFT. — [entity.digilocker.gov.in](https://entity.digilocker.gov.in/); [Fonearena (launch coverage)](https://www.fonearena.com/blog/444592/negd-entity-locker-secure-business-document-management.html/amp); [ETV Bharat, January 2025](https://www.etvbharat.com/en/!bharat/entity-locker-to-simplify-business-document-management-enn25012005910)
- A designated nodal person registers and administers the entity's account and must supply an authorisation letter from the company. Registered entities can share documents with other registered entities using PAN, and both sides must be registered. — [Medianama explainer, January 2025](https://www.medianama.com/2025/01/223-explainer-what-is-entity-locker-difference-digi-locker/)
- Claimed features include 10 GB of encrypted storage and use for vendor verification, MSME loans and simpler GSTN/MCA registration and annual filings. These come from secondary coverage and are unconfirmed. — [Angel One news](https://www.angelone.in/news/entity-locker-digital-infrastructure-for-business-document-management); [gknow](https://gknow.in/?p=34446)
- Entity Locker was first announced in the Union Budget 2023. — [Oxyzo blog](https://www.oxyzo.in/blogs/budget-2023-simplified-what-is-entity-digilocker-and-how-will-it-benefit-your-business/20868)
- API Setu (api.apisetu.gov.in) has a partner page through which organisations register as a DigiLocker **Issuer** or **Requester**. The DigiLocker Issuer (pull) API specification is public. — [api.apisetu.gov.in](https://api.apisetu.gov.in); [WireMock catalogue of DigiLocker Issuer APIs](https://library.wiremock.org/catalog/api/a/apisetu.gov.in/apisetu-gov-in-issuer)
- DigiLocker's Issuer Terms of Use were revised in June 2025. — [DigiLocker Issuer ToU June 2025 (PDF)](https://img1.digitallocker.gov.in/circulars/termsofuse/DigiLocker-Terms-of-Use-Issuer-june-2025.pdf)
- No source confirmed that MCA issues the Certificate of Incorporation into DigiLocker or Entity Locker. Certificates are still described as downloaded from MCA's "Get Certified Copies" service. — [LegalWiz](https://www.legalwiz.in/blog/how-to-download-company-registration-certificate-from-mca)

### Inferences
- A DigiLocker *Requester* integration, if the firm qualified, could let a director share Aadhaar-masked identity documents or PAN with the firm's app under consent, to pre-fill DIR details. Requester onboarding is usually limited to regulated entities and government bodies, so a CA/CS firm may not qualify. (Inference; eligibility not confirmed.)
- For a client company after incorporation, Entity Locker document sharing by PAN is the cleanest lawful way to receive certificates and GST documents. It is entity-to-entity, though, so the firm would need its own Entity Locker account.
- Background knowledge, unverified here: Aadhaar authentication and eKYC are open only to UIDAI-licensed AUAs/KUAs. A professional-services firm cannot run Aadhaar eKYC itself, and storing Aadhaar numbers is restricted. DIN allotment happens inside SPICe+ for up to three directors, and DIR-3 KYC is filed by the director on the portal, with no API.

### Gaps
- No primary NeGD documentation of an Entity Locker API for third-party requesters was found (negd.gov.in was unreachable).
- Whether MCA is actually live as an Entity Locker issuer, and for which documents (CoI, MoA, master data), was not confirmed.

## 5. Commercial data APIs for prefill and verification

### Takeaway
Many vendors sell MCA lookups: CIN/LLPIN master data, DIN details, signatories, name-to-CIN, struck-off checks, plus PAN and GSTIN verification. None found offers an MCA *name-availability* (RUN) endpoint or an SRN-status endpoint. Pricing is mostly not public. Where a figure appears, MCA lookups cost about ₹8 per call and PAN about ₹2 per call (Truid). Most vendors do not disclose whether they use licensed data (OGD, purchased filings) or scrape the captcha-gated V3 pages. That is a legal-diligence item before signing.

### Cited Findings
- **Surepass:** MCA Data APIs for CIN verification and "DIN verification Advance", a Corporate Signatory Details API (input CIN; returns DIN, name, designation, appointment date), a Name-to-CIN API and an MCA Struck-Off Companies Check API. Prices are not public. — [Surepass MCA Data APIs](https://surepass.io/mca-data-apis-cin-din/); [Surepass Signatory API](https://surepass.io/corporate-signatory-details-api/); [Surepass Name to CIN](https://surepass.io/name-to-cin-api/); [Surepass struck-off API](https://surepass.io/mca-struck-off-companies-check-api/)
- **Decentro:** one MCA Verification API for CIN, DIN, LLPIN, FLLPIN and FCRN. — [Decentro API hub](https://decentro.tech/api-hub/mca-verification-api)
- **Qorpiq:** KYB API that takes a CIN, LLPIN or FCRN and returns a normalised profile, with optional charges and principals; also a director master data lookup by DIN. — [Qorpiq docs](https://developers.qorpiq.com/docs/mca-company-master-data); [Qorpiq MCA API](https://qorpiq.com/mca-api)
- **Gridlines:** company verification API that pulls company details "from the MCA database", aimed at vendor and partner onboarding. No name-availability endpoint is listed. — [Gridlines via SoftwareOne marketplace](https://platform.softwareone.com/product/gridlines-company-verification/PCP-2966-6076)
- **IDfy:** "MCA Corporate Verifications" API on RapidAPI (freemium) and a separate "Name compare" API (generic fuzzy name match, not an MCA check). — [RapidAPI IDfy MCA](https://rapidapi.com/es/idfy-idfy-default/api/mca-corporate-verifications/details); [RapidAPI IDfy name compare](https://rapidapi.com/de/idfy-idfy-default/api/name-compare)
- **AuthBridge:** offers an MCA verification check (background-verification product). — [AuthBridge MCA verification](https://authbridge.com/staging/checks/mca-verification/)
- **Signzy:** known for video KYC, OCR, face match and fraud tools in BFSI. No MCA name-check API was found. — search summary
- **Probe42:** advertises detailed data on 1.6 crore+ Indian companies and published an explainer on the V3 rollout. Its data sourcing and licensing were not visible in the results. — search summary of [Probe42 explainer](https://resources.probe42.in/learn-with-probe/probe42-explainer-the-mca-v3-rollout)
- **Sandbox (sandbox.co.in, Quicko group):** pay-as-you-go, no upfront cost, from about 1,000 calls a month (older blog post). No MCA product or rate was found. — [Sandbox Medium blog](https://medium.com/blog-by-sandbox/white-label-sandbox-apis-for-easy-tax-compliance-421adb7bd3d4)
- **Published prices found:** Truid lists PAN verification from ₹2 per call, an MCA21 lookup at ₹8 per call and credit reports from ₹25. Infyner uses credit packs (about ₹1 per credit). Apify OGD actors charge US$0.05 to 0.20 per company record. — [Truid](https://truid.pages.dev/); [Infyner pricing](https://www.infyner.com/api-pricing); [Apify publicrows MCA master](https://apify.com/publicrows/mca-company-master)
- **Others seen:** meon.co.in advertises an "MCA Data V3 portal API" (page not fetchable, so method unknown); companydata.com has an MCA API; the araystech GitHub project wraps compdata.in endpoints (last updated 25 December 2019). — [meon](https://meon.co.in/mca-data-v3-portal-api); [companydata.com](https://companydata.com/mca-api/); [GitHub araystech](https://github.com/araystech/mca-data-api)
- **Name availability:** none of Surepass, Signzy, IDfy or Gridlines appears to offer a name-availability API. The official routes are MCA's free name search and the paid RUN / SPICe+ Part A reservation. — [LegalWiz](https://www.legalwiz.in/blog/how-to-check-company-name-availability-on-mca-portal); [Bajaj Finserv](https://www.bajajfinserv.in/how-to-check-company-name-availability-in-india)
- **Not covered in what was found:** Karza/Perfios, Tofler, Zauba, Setu.

### Inferences (legality and DPDP flags)
- **Scraping risk.** The V3 master data page is captcha-gated and is described as such "to prevent automated scraping" ([cspratik](https://cspratik.gitbook.io/learningcenter/technical-guide/mca-website/mca-master-data/view-company-llp-master-data)). Any vendor that returns *real-time* V3 master data or signatory details per CIN, and does not say it buys certified copies or uses OGD, may be fetching live from the portal, possibly by solving or bypassing the captcha. That cannot be confirmed from outside. Flag as **unverified risk**: Surepass, Decentro, Gridlines, IDfy, Qorpiq, meon, Truid, Infyner, and Apify "MCA registry" actors that are not OGD-based. Before signing, ask each in writing about its source, its licence and whether it complies with MCA terms. Apify actors that state they read the OGD dataset are the lowest-risk bulk option.
- **Director personal data.** DIN, signatory and filed-form data includes personal data of directors (names, addresses; DIR-12 attachments can carry phone numbers and emails). Press reports describe a "spam bazaar" built from MCA filings downloaded by third parties ([BestMediaInfo](https://bestmediainfo.com/mediainfo/mediainfo-digital/heres-how-the-ministry-of-corporate-affairs-open-database-is-fueling-a-spam-bazaar-9585974)). In an RTI reply dated 11 July 2025, MCA said it does not share directors' personal contact information with private entities ([Taxscan](https://www.taxscan.in/top-stories/rti-reveals-mca-discloses-who-has-access-to-company-directors-personal-data-1435440)). So any vendor selling director contact details is a red flag.
- **DPDP Act 2023.** The DPDP Rules were notified on 13–14 November 2025. Rules 1, 2 and 17–21 apply at once, Consent Manager registration (Rule 4) after one year, and the main obligations (notice, consent, security, breach notification; Rules 3, 5–16, 22, 23) after 18 months, about 13 May 2027 ([Mondaq](https://www.mondaq.com/india/data-protection/1708164/digital-personal-data-protection-rules-2025-notified); [YourStory](https://yourstory.com/2025/11/digital-personal-data-protection-dpdp-rules-2025-rollout-over-18-months)). By the time any MCA-connect feature ships, the firm will be a Data Fiduciary for client and director data, and each API vendor will be a Data Processor. The firm needs consent and notice for directors' PAN, Aadhaar and address data, processor contracts with every vendor, purpose limitation, and breach handling. Do not store full Aadhaar numbers. Section 3(c)(ii) of the Act exempts personal data made public under a legal obligation, which arguably covers MCA register data, but that exemption is contested and should not be relied on for scraped data.

### Gaps
- No public price list was found for Surepass, Decentro, Gridlines, IDfy, Signzy, AuthBridge, Probe42 or Sandbox.
- No vendor's data-sourcing statement (licensed or scraped) was retrievable; vendor terms and DPAs need to be requested directly.
- Karza/Perfios, Tofler, Zauba Corp and Setu MCA offerings were not researched within the tool budget.

## 6. Any lawful way to get the SRN or filing status back automatically?

### Takeaway
No official API for SRN or filing status was found. The lawful channels are the emails MCA sends to the registered user or authorised email at each stage (SRN generation, payment, approval, resubmission, issue of CoI with PAN/TAN and linked registration numbers), and a professional checking the captcha-gated "Track SRN/Transaction Status" service manually. A firm's app can lawfully automate *email ingestion*: parse MCA notification emails that reach the firm's own mailbox. It cannot poll the portal.

### Cited Findings
- Under AGILE-PRO-S, once data is validated, the code or number (EPFO, ESIC and so on) is shown on the MCA portal and emailed to the authorised person's email ID. — [Aparajitha FIN-01, March 2020](https://compfie.aparajitha.com/wp-content/uploads/2020/03/06032020_FIN_01.pdf) (2020; the V3 behaviour was not confirmed)
- No source was found describing an official SRN-status API, or the exact wording and format of V3 status emails. — search summary
- MCA public services such as master data are captcha-gated against automation. — [cspratik gitbook](https://cspratik.gitbook.io/learningcenter/technical-guide/mca-website/mca-master-data/view-company-llp-master-data)

### Inferences
- Background knowledge, unverified here: MCA V3 sends emails on SRN generation and payment, on approval, rejection or resubmission (with RoC remarks), and on incorporation (CoI with CIN, PAN, TAN). If the firm files as the Business User, or the client's registered email forwards to a firm mailbox, an Inngest job can read that mailbox (for example the Microsoft Graph mail API, since leads already connect Outlook) and match the SRN to the engagement. This is the most practical lawful way to bring status back in.
- Polling the Track SRN page with a captcha solver would be unlawful under the firm's rule and should be ruled out.

### Gaps
- The exact sender addresses, subject formats and V3 email templates for SPICe+ stages were not found. Collect real samples from the firm's own past filings.
- Whether V3's Business User dashboard offers any export (CSV) of the user's own filings and SRNs was not found.
