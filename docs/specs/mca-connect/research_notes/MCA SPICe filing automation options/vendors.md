# Third-party vendors and services for SPICe+ (INC-32) and linked forms on MCA V3

Research date: 2026-11-05. Desk research only: no sign-ups, trials, vendor contact or MCA portal access.

**Method limit that matters to the reader.** In this session every direct page fetch failed (saginfotech.com, blog.saginfotech.com, complyrelax.com and chromewebstore.google.com do not resolve inside the session's network allow-list). Every finding below therefore comes from search-engine result summaries of the cited pages, not from reading the full page. Treat exact wording as approximate, and re-read the primary page before relying on any single sentence. Those four hosts have to be allowed in the session's network settings for a verification pass.

## 1. Which products and services exist, and what each one is

### Takeaway
Only two desktop/cloud ROC packages surfaced with explicit, vendor-documented SPICe+ support on V3: SAG Infotech's Gen CompLaw (SPICe+ Part A/B plus INC-33 and INC-34) and, more weakly, Computax's CompuRoc (CIN/DIN master import, no SPICe+ mention found). ComplyRelax is documented for V3 annual filing (AOC-4, MGT-7/7A), not incorporation. The large online services (Vakilsearch/Zolvit, IndiaFilings, LegalWiz) are done-for-you services, not software a firm can plug into. Most other names in the brief (Leagully, CSTrax, AutoROC, Winman CS, Spectrum ROC, EasyOffice ROC, Taxmann ROC, Saral ROC) returned nothing specific to SPICe+ on V3.

### Cited Findings

**Desktop / cloud ROC software (category: "prepare and file" tools used by the professional)**
- Gen CompLaw (SAG Infotech, Jaipur) is described as ROC software "for filing MCA V3 e-Forms, XBRL, registers and other critical MIS reports", and one listing calls it cloud-based. — [Capterra India](https://www.capterra.in/software/1034192/gen-complaw); [SoftwareAdvice AU](https://www.softwareadvice.com.au/software/505988/Gen-Complaw)
- A SaaSworthy profile says Gen CompLaw "integrates with the MCA V3 portal" to handle AOC-4, MGT-7/7A, PAS-3 and SPICe+ in one workflow (aggregator text that repeats the vendor). — [SaaSworthy](https://www.saasworthy.com/product/gen-complaw-sw); [SaaSworthy Winman alternatives](https://www.saasworthy.com/product-alternative/58216/winman-ca-erp)
- SAG Infotech's own walkthrough (vendor material, roughly mid-2025) describes a SPICe+ flow in the software: choose "Part A & Part B", "Part A only" or "Part B only" (Part B only when the name is already approved); fill sections B-1 to B-4; choose the "generate" option and "the relevant MCA V3 ID"; the software "saves the form on the MCA V3 portal"; the user then previews and submits; then the user clicks Form INC-34, selects the login ID, and repeats for INC-33; the PDF is downloaded from the software's "MCA V3 application" option. — [SAG Infotech blog, SPICe+ via Gen CompLaw](https://blog.saginfotech.com/file-spice-plus-form-gen-complaw-software) (seen via search summary only)
- SAG Infotech's Gen ROC download page lists "e-filing of MCA V3 forms such as CHG forms, PAS-3, and SPICe Plus" and offers a trial. — [SAG Infotech blog, free download ROC software FY 2025-26](https://blog.saginfotech.com/free-download-roc-return-filing-software)
- Gen CompLaw advertises AI import of financial data from PDF or Word files (for annual forms). — [Gen CompLaw product page](https://saginfotech.com/GenCompanye-filer.aspx) (via search summary)
- CompuRoc (Computax / Taxsoft) is listed as web-based ROC software covering Section 8, private, OPC, public and LLP companies, able to "import company master information from the MCA Portal using the CIN" and director information "using the DIN". No SPICe+ or incorporation feature surfaced. — [CompuRoc product page](https://computaxonline.com/product/roc-software); [Computax products](https://www.computax.co.in/products-and-services.html)
- Computax also publishes Chrome extensions named "CompuOffice Online Extension" and "CompuOffice Online - Online Activity"; their listings could not be read, so their MCA scope is unknown. — [Chrome Web Store: CompuOffice Online Extension](https://chromewebstore.google.com/detail/compuoffice-online-extens/aginpdbdkhdcfgdndhbagboecblnhfgp); [Chrome Web Store: CompuOffice Online - Online Activity](https://chromewebstore.google.com/detail/compuoffice-online-online/nlklakgjaincgpbgofacpebeionaanpg); [ChromeBoard mirror](https://chromeboard.com/extension/compuoffice-online-extens-aginpdbdkhdcfgdndhbagboecblnhfgp)
- ComplyRelax markets an "MCA V3 Annual Filing Solution embedded with AI": it generates AOC-4, MGT-7 and MGT-7A with the linked Audit Report and Board Report "without requiring MCA portal login", with "Import PY Form" and "Use AI Import" (from a financial-statement Excel file and auditor's report). Forms are then downloaded, reviewed and DSC-signed before submission. No SPICe+ / INC-32 feature surfaced. — [ComplyRelax Annual Filing](https://complyrelax.com/AnnualFiling.php); [ComplyRelax user guide PDF](https://complyrelax.com/Task-Management/files/timeline_files/note_file68a448b66f1c3-Annual-Filing-Forms.pdf); [ComplyRelax AI MCA/ROC page](https://ai.complyrelax.com/mca-roc-filing-compliance)
- ComplyRelax claims it pulls company and director details "from your existing records and MCA database" and that DIN details are auto-fetched across forms (vendor claim). — [ComplyRelax home](https://complyrelax.com/)
- Saral (Relyon) results covered only income-tax products (pre-filled JSON, 26AS/AIS); no Saral ROC/SPICe+ product surfaced. — [Saral Pro income tax](https://saral.pro/income-tax-software/); [Techjockey CompuTax vs Saral](https://www.techjockey.com/compare/computax-income-tax-software-vs-relyonsoft-saral-income-tax)
- Ledgers.cloud has an "ROC filing with Ledgers" page (compliance module of an accounting suite); its SPICe+ scope was not visible in the result. — [Ledgers.cloud ROC filing](https://ledgers.cloud/in/compliance/roc-filing-with-ledgers)

**Browser extensions and login helpers (category: work in the user's own browser)**
- AdunaData Extension: Chrome Web Store text describes a productivity extension "for filling forms on the MCA portal and the AdunaData platform"; about 16 users at the time indexed. — [Chrome Web Store: AdunaData](https://chromewebstore.google.com/detail/cjnpgokbcdifjfpjmibjgbkjlhiaoihj); [ExtensionAuditor scan](https://extensionauditor.com/scan/adunadata-extension-cjnpgokbcdifjfpjmibjgbkjlhiaoihj)
- Cloudatahub Tax & Compliance (Chrome): redirects from its dashboard to the right government portal for a client task, and offers "smart clipboard assistance" for MCA V3 login; does not appear to fill ROC forms. — [Chrome Web Store: Cloudatahub](https://chromewebstore.google.com/detail/cloudatahub-tax-complianc/apkpllafilljgigbpjpgebpoejflacec)
- RMK Tech Services "Portal Login Filler": fills the MCA21 V3 user ID and password for the account picked from a client list kept in the user's own spreadsheet; the vendor states it "never clicks Login or submits the form", and that MCA21 still requires the user to type the CAPTCHA (and OTP). — [rmktechservices MCA login filler](https://rmktechservices.com/portal-login-filler/mca-login)
- TaxPido PMS (practice management) is described as allowing "login into client's accounts on various portals like GST, Income Tax, TRACES, E-way Bill, MCA v2 & v3 and DGFT" — a login aid, not a filer. — search summary of [ROC automation Chrome extension results](https://legalsuvidha.com/blog/automate-roc-compliance-save-100-hours) (the TaxPido claim appeared in the same result set; primary TaxPido page not retrieved)
- An extension listed on ExtScope (id cldkfgelbiljjfemghhgcgiiaghbaehm) appeared in "ROC filing automation Chrome extension" results with a "medium-risk permissions" flag; its name and function were not visible. — [ExtScope](https://extscope.org/extension/cldkfgelbiljjfemghhgcgiiaghbaehm)

**Done-for-you online incorporation services (category: they file for you)**
- Vakilsearch, now branded Zolvit, advertises private limited registration from ₹999 plus government fee (a ₹1,499 offer price on the same page) with a 7-business-day turnaround and "submission guarantee"; it says it handles DSC procurement. — [Vakilsearch company registration](https://vakilsearch.com/company-registration); [Zolvit Play Store app](https://play.google.com/store/apps/details?id=com.vakilsearch.crm&hl=en_IN)
- An IndusInd Bank partner offer (valid to 31 March 2027) lists Vakilsearch/Zolvit private limited registration at ₹799. — [IndusInd Bank Vakilsearch offer](https://www.indusind.bank.in/in/en/business/offers/taxation-and-legal/Vakilsearch.html)
- Package prices "as listed on their own sites in September 2026": IndiaFilings ₹2,899, LegalWiz ₹2,999; IndiaFilings turnaround 7 to 10 days; IndiaFilings says the client bears government fees and DSC charges (figures reported by a Vakilsearch comparison page, i.e. a competitor). — [Vakilsearch alternatives 2026](https://vakilsearch.com/learn/vakilsearch-alternatives/); [Best company registration services 2026](https://vakilsearch.com/article/best-company-registration-services-india-2026/)
- FilingLab publishes a "FilingLab vs Vakilsearch / Zolvit" founder comparison (2026), so FilingLab is a further online registration service; a later search for it returned nothing else. — [FilingLab vs Vakilsearch](https://filinglab.com/alternatives/vakilsearch)
- Other consultancies offering SPICe+ as a service in 2026 results: RegisterKaro, Kanakkupillai, Ebizfiling, LegalSuvidha, IncorpX, VJM Global, Teamed. — [RegisterKaro SPICe+](https://www.registerkaro.in/spice-plus-form); [Ebizfiling AI startup registration](https://ebizfiling.com/service/ai-startup-company-registration-india/); [LegalSuvidha SPICe+ 2026](https://legalsuvidha.com/blog/spicespice-plus-mca-form-for-company-registration); [IncorpX agentic AI startup registration](https://www.incorpx.io/blog/agentic-ai-startup-registration-india); [VJM Global](https://www.vjmglobal.com/feeds/blog/spice-company-registration-india); [Teamed India entity setup](https://www.teamed.global/country-hiring-guides/india/entity-setup)

**Data APIs (read-only, not filing)**
- Surepass sells commercial MCA data APIs (CIN and DIN lookups) that it says cover V2 and V3 documents; this is a vendor wrapper, not an official MCA API, and it does not file forms. — [Surepass MCA data APIs](https://surepass.io/mca-data-apis-cin-din-v3-portal/)
- "MCA Suite" (mcasuite2.freshdesk.com) documents a workspace API (client credentials, tokens renewed every 10 minutes, article dated April 2025); it is a separate private product, not the MCA V3 portal, and its SPICe+ scope is unknown. — [MCA Suite API help](https://mcasuite2.freshdesk.com/support/solutions/articles/6000275097-how-do-i-use-mca-suite-apis-)

### Inferences
- The "ROC software" market for V3 is thin on incorporation. Vendors moved first to annual filing (AOC-4, MGT-7), where data repeats year to year; SPICe+ is a one-off per company and is mostly done by hand on the portal or outsourced to services.
- Gen CompLaw is the only product found whose own material describes pushing a SPICe+ draft into the V3 portal and then handling INC-33/INC-34 from the same screen. It is the closest existing analogue to what the firm wants to build.
- The online services (Vakilsearch/Zolvit, IndiaFilings, LegalWiz, FilingLab) do not remove double typing for a CS/CA firm; they move the typing to their own staff, and the firm loses the client relationship and the professional certification fee.

### Gaps
- No result at all for Leagully, CSTrax, AutoROC, Winman CS/ROC, Spectrum ROC, EasyOffice ROC, Taxmann ROC software, TaxCloud India, Clear (ClearTax) MCA filing, Corpzo, Registrationwala, Capitall, Tally-integrated ROC tools, or "iCompliance". Their existence and SPICe+ V3 support are unconfirmed, not disproved.
- No Vakilsearch/Zolvit partner or white-label API for incorporation surfaced.
- No "AI agent" product that submits SPICe+ end to end surfaced; IncorpX and others publish AI-themed guides but describe a human-run service.
- The primary pages (SAG blog, ComplyRelax, Chrome Web Store listings) could not be opened; their exact current text is unverified.

## 2. How each one connects to MCA, and what a human still does

### Takeaway
Nothing found uses an official MCA filing API, because none was found to exist. Gen CompLaw appears to work in category (c): it uses the professional's own stored MCA V3 login ID to save a SPICe+ draft on the portal, after which a human previews, submits, signs the linked-form PDFs with DSC and pays. Extensions sit in category (b) or below (login fill only). ComplyRelax and CompuRoc sit in category (a) for the forms they cover. In every case found, the human types the CAPTCHA and OTP, signs with DSC and pays the MCA fee.

### Cited Findings
- The official V3 sequence: once the SPICe+ Part B web form is submitted, access to the linked forms (eMoA INC-33, eAoA INC-34, INC-9, URC-1, AGILE-PRO-S) is enabled; the user fills them, affixes DSC on the downloaded PDFs and uploads the DSC-affixed PDFs to the portal. — [MCA FAQ, SPICe+ and linked filings](https://www.mca.gov.in/content/mca/global/en/help-faq/faqs/company-services/incorporation/spiceplus-linked-filings.html); [MCA instruction kit, SPICe+ Part B](https://www.mca.gov.in/content/dam/mca-aem-forms/instructionkits/Instruction%20Kit_SPICe%20+%20Part%20B.pdf); [MCA FAQ PDF, 22 Jan 2023](https://www.mca.gov.in/content/dam/mca/pdf/SPICEplus-and-linked-filings-FAQs-V3-20230122.pdf)
- The MCA FAQ itself says one statement "needs to be checked and updated post deployment of remaining forms on V3", so official guidance may lag the live portal. — [MCA FAQ, SPICe+ and linked filings](https://www.mca.gov.in/content/mca/global/en/help-faq/faqs/company-services/incorporation/spiceplus-linked-filings.html)
- SPICe+ Part B must link to an approved Part A SRN or RUN reference; Part A approval is valid for 20 days; a standard private company files Part B with AGILE-PRO-S, INC-9, INC-33 and INC-34. — [LegalSuvidha SPICe+ 2026](https://legalsuvidha.com/blog/spicespice-plus-mca-form-for-company-registration)
- V3 login is by registered email for individuals (CIN/LLPIN for company users); business users receive an OTP on registered mobile and email at login. — [ICSI V3 registration guide](https://www.icsi.edu/media/webmodules/Login_Process.pdf); [CorpLawUpdates V3 login guide](https://www.corplawupdates.in/updates/mca21-v3-login-guide); [SAG V3 login FAQ PDF](https://blog.saginfotech.com/wp-content/uploads/2022/04/login-faq.pdf)
- Filing needs a Business User account with an associated DSC; practising professionals need their own V3 business-user profiles to certify and file for clients. — [SAG Infotech, ROC software and V3](https://blog.saginfotech.com/roc-software-handle-mca-ver-3-forms-filing); [SansaLegal V2 decommission note](https://www.sansalegal.com/post/mca-decommissions-legacy-mca21-v2-portal-v3-migration-deadline-june-30-2026)
- Gen CompLaw flow (vendor): user picks "the relevant MCA V3 ID", software "saves the form on the MCA V3 portal", user previews and submits, then selects the login ID again for INC-34 and INC-33. — [SAG Infotech blog](https://blog.saginfotech.com/file-spice-plus-form-gen-complaw-software)
- SAG's article on how ROC software handles V3 talks about business-user roles, DSC authentication and online form completion but does not say whether the software stores or enters passwords, or who types CAPTCHA/OTP. — [SAG Infotech, ROC software and V3](https://blog.saginfotech.com/roc-software-handle-mca-ver-3-forms-filing)
- RMK's login filler states it fills user ID and password only, never clicks Login, and leaves the CAPTCHA to the user. — [rmktechservices](https://rmktechservices.com/portal-login-filler/mca-login)
- ComplyRelax generates annual forms "without requiring MCA portal login"; the user downloads, reviews, DSC-signs and submits. — [ComplyRelax Annual Filing](https://complyrelax.com/AnnualFiling.php); [ComplyRelax user guide PDF](https://complyrelax.com/Task-Management/files/timeline_files/note_file68a448b66f1c3-Annual-Filing-Forms.pdf)
- V3 itself pre-fills master data (company name, registered office, directors, authorised capital) when a CIN or DIN is entered; this pre-fill is a portal feature, not a vendor one, and Business Standard (2025) reported that pulling data out of V3 for auto-filling "remains a challenge" for some forms. — [SpotOnZ V3 guide](https://www.spotonz.com/blog/mca-v3-portal-guide-india/); [Business Standard, 16 Jul 2025](https://www.business-standard.com/economy/news/mca-version-3-portal-improves-user-experience-post-glitches-125071600875_1.html)
- The MCA SPICe+ objects clause is pre-filled from NIC codes, and SPICe+ is filed with MoA and AoA as attachments (not e-MoA/e-AoA) when subscribers exceed seven. — [MCA FAQ, SPICe+ and linked filings](https://www.mca.gov.in/content/mca/global/en/help-faq/faqs/company-services/incorporation/spiceplus-linked-filings.html)
- Each director needs a DSC; a practising professional certifies the filing. — [Teamed India entity setup](https://www.teamed.global/country-hiring-guides/india/entity-setup); [Vakilsearch company registration](https://vakilsearch.com/company-registration)
- The SPICe+ government fee is reported as ₹0 for authorised capital up to ₹15 lakh, plus state stamp duty; DSC cost is reported as ₹2,000 to ₹4,000 for two directors by one source and ₹1,500 to ₹2,500 per director by another (conflicting). — [Vakilsearch, best registration services 2026](https://vakilsearch.com/article/best-company-registration-services-india-2026/); [Vakilsearch vs RegisterKaro](https://vakilsearch.com/article/vakilsearch-vs-registerkaro-company-registration/)

**Per-vendor classification (a = prepare data/PDF only; b = fill V3 web form in user's own browser; c = log in on user's behalf with stored MCA credentials; d = official API)**

| Vendor | Class | Evidence | CAPTCHA / OTP | DSC | Who pays MCA fee |
|---|---|---|---|---|---|
| Gen CompLaw (SAG) | c (inferred from "select MCA V3 ID … saves the form on the MCA V3 portal") | vendor blog | not stated | user, on downloaded linked-form PDFs (per MCA flow) | user on portal (inferred) |
| CompuRoc (Computax) | a, plus CIN/DIN master import | vendor page | n/a | user | user |
| ComplyRelax | a (annual forms only; "without MCA login") | vendor page | n/a | user | user |
| AdunaData extension | b (claimed "filling forms on the MCA portal") | store listing | user (inferred) | user | user |
| RMK Portal Login Filler | b, login fields only | vendor page | user (stated) | user | user |
| Cloudatahub | b, navigation and clipboard only | store listing | user | user | user |
| TaxPido PMS | login aid | search snippet | not stated | user | user |
| Vakilsearch/Zolvit, IndiaFilings, LegalWiz, FilingLab, RegisterKaro etc. | service: their staff file | vendor pages | their staff, with OTP from client's directors | directors' DSCs, often procured by the service | client, via the service invoice |
| Surepass, MCA Suite | data API (read) only | vendor pages | n/a | n/a | n/a |

### Inferences
- "Saves the form on the MCA V3 portal" against a selected "MCA V3 ID" implies Gen CompLaw holds or receives the professional's V3 login and opens a session on their behalf. Because V3 business-user login requires an OTP to registered mobile and email, a human almost certainly still supplies the OTP (and any CAPTCHA) at that moment; the vendor material found does not say.
- No product found removes the three human steps that the V3 design forces: OTP/CAPTCHA at login, DSC affixing on the linked-form PDFs, and fee payment. A firm-built tool can at best match Gen CompLaw: own the data, pre-build the forms, and leave login, review, signing and payment to the professional.
- Category (b), a browser extension that fills the V3 web form in the professional's own logged-in session, is the only pattern found that needs no credential sharing; the evidence for any extension doing this for SPICe+ is a single 16-user listing.

### Gaps
- Whether Gen CompLaw stores MCA passwords locally, in its cloud, or asks each time; whether it drives a headless browser, an embedded browser, or replays portal HTTP calls. This decides whether it falls under the firm's "nothing illegal / no private-endpoint replay" rule, and the vendor material found does not say.
- Whether any tool handles AGILE-PRO-S (INC-35) and INC-9/URC-1 explicitly; the Gen CompLaw material mentions only INC-33 and INC-34.
- Who types the CAPTCHA/OTP inside Gen CompLaw's flow.

## 3. Import paths a third-party system (such as a Next.js app) could push data into

### Takeaway
No vendor found offers a documented import API or webhook for SPICe+ data. The import features found are file-based and aimed at annual filing: ComplyRelax's Excel/PDF "AI Import" and previous-year import, Gen CompLaw's PDF/Word AI import, and CompuRoc's pull of master data from MCA by CIN/DIN. MCA itself publishes no filing API for professionals.

### Cited Findings
- ComplyRelax "Use AI Import" extracts data from a financial-statement Excel file and the auditor's report; "Import PY Form" copies last year's form (annual forms only). — [ComplyRelax user guide PDF](https://complyrelax.com/Task-Management/files/timeline_files/note_file68a448b66f1c3-Annual-Filing-Forms.pdf)
- Gen CompLaw lets users import financial data from PDF or Word files via AI. — [Gen CompLaw product page](https://saginfotech.com/GenCompanye-filer.aspx)
- CompuRoc imports company master data by CIN and director data by DIN from the MCA portal. — [CompuRoc](https://computaxonline.com/product/roc-software)
- One V3 guide says ROC tools now focus on "pre-filling web forms or generating Excel upload sheets" because V3 forms are completed in the browser. — summary of [SAG Infotech, ROC software and V3](https://blog.saginfotech.com/roc-software-handle-mca-ver-3-forms-filing) and [LegalSuvidha ROC company forms](https://legalsuvidha.com/blog/roc-company-forms)
- RMK's login filler reads the client list from the user's own spreadsheet. — [rmktechservices](https://rmktechservices.com/portal-login-filler/mca-login)
- No official MCA V3 filing API was found; the only source describing V3 "bulk upload, status polling and data retrieval APIs" is a single unofficial blog, unconfirmed by MCA. — [IncorpX, V3 filing changes 2026](https://www.incorpx.io/blog/mca-v3-portal-filing-changes-2026); [MyTaxExpert, V3 digitisation 2025-26](https://mytaxexpert.co.in/post.php?id=11326)
- MCA Suite (a private product) exposes an OAuth-style workspace API with 10-minute tokens (April 2025); its form coverage is unknown. — [MCA Suite API help](https://mcasuite2.freshdesk.com/support/solutions/articles/6000275097-how-do-i-use-mca-suite-apis-)

### Inferences
- A firm holding client data in its own Next.js app cannot push SPICe+ data into any vendor found through a documented interface. Integration would mean exporting to a vendor's file format (if one exists for SPICe+, which was not found) or building the form-filling step itself.
- The "IncorpX says MCA has bulk APIs" claim should not be built on; it has no official backing.

### Gaps
- Whether Gen CompLaw accepts an Excel or JSON import for SPICe+ fields (subscribers, directors, capital, address). Not found.
- Whether any vendor exposes a REST API, webhook or CSV schema for incorporation data. Not found.

## 4. Pricing, deployment and last V3 updates

### Takeaway
Software pricing for the ROC packages was not visible in any result. Service pricing is public and low (₹799 to ₹2,999 plus government fee and DSC). V3 has kept changing through 2025 and 2026, which is the main maintenance risk for any tool that fills the web form.

### Cited Findings
- Gen CompLaw: cloud-based per one listing; trial version offered; price not visible in results. — [SoftwareAdvice AU](https://www.softwareadvice.com.au/software/505988/Gen-Complaw); [SAG free download page](https://blog.saginfotech.com/free-download-roc-return-filing-software)
- CompuRoc: web-based; price not visible. — [CompuRoc](https://computaxonline.com/product/roc-software)
- Vakilsearch/Zolvit ₹999 (offer ₹1,499) plus government fee; ₹799 via IndusInd to 31 March 2027; IndiaFilings ₹2,899; LegalWiz ₹2,999 (September 2026 figures, competitor-reported); IndiaFilings combined registration-plus-compliance ₹19,899 plus GST. — [Vakilsearch](https://vakilsearch.com/company-registration); [IndusInd](https://www.indusind.bank.in/in/en/business/offers/taxation-and-legal/Vakilsearch.html); [Vakilsearch alternatives](https://vakilsearch.com/learn/vakilsearch-alternatives/)
- V3 timeline: SPICe+ Part A and 45 company e-forms moved to V3 with a no-additional-fee extension to 31 March 2023 because of "the change in filing method in Version 3". — [MCA notice, extension for 45 e-forms and SPICe+ Part A](https://www.mca.gov.in/bin/dms/getdocument?mds=2wjQ2Yt5XCZLAoGRr2jfOQ%3D%3D&type=open)
- The final 38 company e-forms went live on V3 from 14 July 2025 (MGT-7/7A exclusively on V3). — [LG Associates, 38 forms to V3](https://lgassociates.org/mca-migrates-38-company-e-forms-to-v3-portal-everything-businesses-need-to-know/); [CA Rajput, MGT-7 migration](https://carajput.com/blog/roc-return-filing-migration-of-mgt-7-mgt-7a-to-mca-v3-portal/); [IncorpX, 38 new forms](https://www.incorpx.io/blog/mca-v3-portal-38-new-company-forms-2026)
- Sources conflict on V2 shutdown: 18 June 2025, 14 July 2025, and 30 June 2026 are all claimed. — [SansaLegal](https://www.sansalegal.com/post/mca-decommissions-legacy-mca21-v2-portal-v3-migration-deadline-june-30-2026); [Ebizfiling, shifting of forms](https://ebizfiling.com/blog/shifting-of-forms-from-mca/); [LegalSuvidha, e-forms upgrade 2026](https://legalsuvidha.com/blog/mca-updateupgradation-of-e-forms-in-v3-portal)
- Business Standard (October 2025) reported MCA fixing V3 glitches and reviewing server capacity under high load. — [Business Standard, Oct 2025](https://www.business-standard.com/industry/news/mca-v3-portal-technical-issues-server-upgrade-corporate-affairs-125102600219_1.html)
- ICSI has asked MCA to extend AOC-4/MGT-7 due dates to 31 December 2026 citing V3 login and upload failures; not confirmed as granted at the time of the report. — [caclubindia, V3 login failures 2026](https://www.caclubindia.com/news/mca21-v3-portal-login-failures-and-errors-disrupt-annual-return-filings-for-professionals-26895.asp)

### Inferences
- Any tool that fills or saves V3 web forms (Gen CompLaw's approach, or an extension) must be updated whenever MCA changes a form; with 2025-2026 changes still landing, that maintenance cost is real.

### Gaps
- No ROC software list prices; no "last updated" date for Gen CompLaw's SPICe+ module beyond the roughly mid-2025 blog post; no Chrome extension "last updated" dates (store pages could not be opened).

## 5. MCA approval, objections, account blocking and security

### Takeaway
No MCA empanelment or approval scheme for third-party filing software was found, and no MCA notice objecting to such tools or blocking accounts for using them was found. Every tool that logs in for the user, or any that solved CAPTCHAs, would raise the legality and security questions the firm cares about; none of the vendors found claims to bypass CAPTCHA or OTP.

### Cited Findings
- Searches for MCA notices about third-party software, bots or account blocking returned none; only general login/CAPTCHA complaints. — [Taxmann, MCA FAQs on V3 login](https://www.taxmann.com/post/blog/mca-issues-faqs-on-the-v3-portal-to-address-login-and-registration-issues); [taxguru, ICSI on V3 issues](https://taxguru.in/company-law/mca-21-v3-portal-issues-challenges-highlighted-icsi.html)
- ICSI (2024) flagged "excessive captcha usage" on V3, with master-data viewing needing CAPTCHA up to four times. — [taxguru, ICSI on V3 issues](https://taxguru.in/company-law/mca-21-v3-portal-issues-challenges-highlighted-icsi.html)
- V3 locks an account after repeated failed attempts, and parallel sessions make it worse (commercial blog, not official). — [IncorpX, V3 login errors 2026](https://www.incorpx.io/blog/mca-v3-login-errors-fixes-2026)
- RMK's extension states it does not click Login or submit, leaving CAPTCHA to the user (a deliberate compliance-friendly design, vendor claim). — [rmktechservices](https://rmktechservices.com/portal-login-filler/mca-login)
- ExtScope flags one ROC-related extension as having "medium-risk permissions". — [ExtScope](https://extscope.org/extension/cldkfgelbiljjfemghhgcgiiaghbaehm)

### Inferences
- **Flag for the firm's "nothing illegal" rule.** Category (c) tools (stored MCA credentials, logging in from a desktop agent or cloud) mean the professional's V3 business-user credentials leave their hands; MCA's own terms on credential sharing were not reviewed here and should be checked before adopting such a tool or copying its design. Any tool that solved CAPTCHA automatically, or replayed private portal HTTP endpoints, would be a further step the firm should refuse; none of the vendors found claims to do either, but Gen CompLaw's mechanism is undocumented.
- The safest pattern seen is RMK's and ComplyRelax's: the tool prepares data and fills fields, and the human logs in, types CAPTCHA and OTP, signs and submits.
- The repeated-attempt lockout and parallel-session sensitivity mean an automation that opens sessions in the background could lock a professional's account even without any MCA policy against tools.

### Gaps
- MCA21 V3 terms of use on automated access and credential sharing were not retrieved.
- No reported security incident or account block linked to a named vendor was found.
- No vendor claims MCA empanelment, and no MCA list of approved software was found; absence is not proof that none exists.
